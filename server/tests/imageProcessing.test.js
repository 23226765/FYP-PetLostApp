import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { processImage } from '../services/imageProcessing.js'
import { IMAGE_LIMITS, IMAGE_PURPOSES } from '../config/imageStorage.js'

function fixture(width = 80, height = 60) {
  return sharp({ create: { width, height, channels: 3, background: '#1d6360' } })
}

test('JPEG, PNG and static WebP are decoded and re-encoded as safe WebP', async () => {
  for (const format of ['jpeg', 'png', 'webp']) {
    const output = await processImage(await fixture().toFormat(format).toBuffer(), 'pet')
    assert.equal(output.format, 'webp')
    assert.equal(output.bytes, output.buffer.length)
    assert.equal(output.width, 80)
    assert.equal(output.height, 60)
    assert.match(output.checksum, /^[a-f0-9]{64}$/)
    const meta = await sharp(output.buffer).metadata()
    assert.equal(meta.format, 'webp')
    for (const key of ['exif', 'xmp', 'iptc', 'icc']) assert.equal(meta[key], undefined)
  }
})

test('EXIF orientation is corrected and GPS/copyright metadata is stripped', async () => {
  const input = await fixture(90, 50).jpeg().withMetadata({ orientation: 6 }).withExifMerge({
    IFD0: { Copyright: 'Fictional private fixture' },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '22/1 23/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '114/1 11/1 0/1' },
  }).toBuffer()
  const source = await sharp(input).metadata()
  assert.equal(source.orientation, 6)
  assert.ok(source.exif)
  const output = await processImage(input, 'sighting')
  assert.equal(output.width, 50)
  assert.equal(output.height, 90)
  assert.equal((await sharp(output.buffer).metadata()).exif, undefined)
  assert.equal(output.buffer.includes(Buffer.from('Fictional private fixture')), false)
})

test('every purpose enforces dimensions/output size without enlargement', async () => {
  const input = await fixture(2000, 1500).png().toBuffer()
  for (const [purpose, policy] of Object.entries(IMAGE_PURPOSES)) {
    const output = await processImage(input, purpose)
    assert.ok(output.width <= policy.side && output.height <= policy.side)
    assert.ok(output.bytes <= policy.bytes)
  }
})

test('rejects SVG, executable/disguised data, GIF and unsupported raster formats', async () => {
  const rejected = [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    Buffer.from('MZ executable renamed .jpg'), Buffer.from('<html>not a jpeg</html>'),
    Buffer.from('GIF89a'), await fixture().tiff().toBuffer(), Buffer.alloc(0),
  ]
  for (const input of rejected) await assert.rejects(processImage(input, 'pet'), { code: 'IMAGE_INVALID' })
})

test('rejects corrupt/truncated JPEG and oversized buffers', async () => {
  const jpeg = await fixture(300, 200).jpeg().toBuffer()
  await assert.rejects(processImage(jpeg.subarray(0, 80), 'pet'), { code: 'IMAGE_INVALID' })
  await assert.rejects(processImage(Buffer.alloc(IMAGE_LIMITS.inputBytes + 1), 'pet'), { code: 'IMAGE_TOO_LARGE' })
})

test('rejects pixel bombs and excessive individual dimensions', async () => {
  await assert.rejects(processImage(await fixture(IMAGE_LIMITS.side + 1, 1).png().toBuffer(), 'pet'), { code: 'IMAGE_TOO_LARGE' })
  await assert.rejects(processImage(await fixture(6400, 6400).png().toBuffer(), 'pet'), { code: 'IMAGE_TOO_LARGE' })
})

test('rejects animated WebP instead of silently retaining one frame', async () => {
  const a = await fixture(10, 10).png().toBuffer()
  const b = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ef6351' } }).png().toBuffer()
  const animated = await sharp([a, b], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer()
  assert.equal((await sharp(animated).metadata()).pages, 2)
  await assert.rejects(processImage(animated, 'stray'), { code: 'IMAGE_INVALID' })
})

test('re-encoding discards trailing executable markup from a decodable raster', async () => {
  const jpeg = await fixture().jpeg().toBuffer()
  const output = await processImage(Buffer.concat([jpeg, Buffer.from('<script>malicious-marker</script>')]), 'pet')
  assert.equal(output.buffer.includes(Buffer.from('malicious-marker')), false)
})

test('high-entropy avatar compression remains within the configured cap', async () => {
  const input = await sharp(randomBytes(800 * 800 * 3), { raw: { width: 800, height: 800, channels: 3 } }).png().toBuffer()
  const output = await processImage(input, 'avatar')
  assert.ok(output.bytes <= IMAGE_PURPOSES.avatar.bytes)
})

test('rejects invalid and inherited-property purposes', async () => {
  for (const purpose of ['document', 'constructor', '__proto__']) {
    await assert.rejects(processImage(Buffer.from('anything'), purpose), { code: 'IMAGE_PURPOSE_INVALID' })
  }
})
