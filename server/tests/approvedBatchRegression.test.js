import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import User from '../models/User.js'
import UserBlock from '../models/UserBlock.js'
import { smartMatch } from '../controllers/petController.js'
import { approximateCoordinates } from '../services/locationPrivacy.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'

test('Smart Match scores, totals, bands, limit selection and ordering are invariant to exact movement within a public cell', async () => {
  const originals = [Pet.find, Sighting.aggregate, User.find, UserBlock.find]
  const centre = approximateCoordinates([114.19, 22.38])
  const records = ['a', 'b'].map((character) => ({
    _id: character.repeat(24), reportedBy: 'c'.repeat(24), name: `Fictional ${character}`,
    species: 'Dog', breed: 'Shiba Inu', status: 'lost', district: 'Sha Tin',
    createdAt: new Date('2020-01-01'), location: { type: 'Point', coordinates: [...centre] },
  }))
  try {
    Pet.find = async () => records
    Sighting.aggregate = async () => []
    User.find = () => ({ select: async () => [] })
    UserBlock.find = () => ({ select: async () => [] })
    for (const user of [undefined, { _id: 'd'.repeat(24), role: 'user' }, { _id: 'e'.repeat(24), role: 'shelter_admin' }]) {
      for (const offset of [[0.02, 0], [0, 0.02], [-0.02, 0.01]]) {
        const request = { user, body: { species: 'Dog', breed: 'Shiba', coordinates: centre.map((v, i) => v + offset[i]), limit: 1 } }
        const invoke = async () => {
          const response = { json(payload) { this.payload = JSON.parse(JSON.stringify(payload)) } }
          await smartMatch(request, response, (error) => { throw error })
          return response.payload
        }
        records[0].location.coordinates = [centre[0] - 0.001, centre[1] - 0.001]
        records[1].location.coordinates = [centre[0] + 0.001, centre[1] + 0.001]
        const before = await invoke()
        records.reverse()
        for (const record of records) record.location.coordinates = [centre[0] + 0.0005, centre[1] - 0.0005]
        const after = await invoke()
        assert.deepEqual(after, before)
        assert.equal(after.matches[0].id, 'a'.repeat(24))
        assert.equal('distanceKm' in after.matches[0].breakdown, false)
        assert.deepEqual(after.matches[0].coordinates, centre)
        const breakdown = after.matches[0].breakdown
        assert.equal(after.matches[0].totalScore, breakdown.species + breakdown.breed + breakdown.distance + breakdown.recency)
        assert.equal(after.matches[0].confidence, after.matches[0].totalScore)
      }
    }
  } finally { [Pet.find, Sighting.aggregate, User.find, UserBlock.find] = originals }
})

test('real HTTP auth boundary distinguishes invalid credentials from mocked database outages for every role', async () => {
  const secret = 'Isolated!Auth-Service-Regression-Secret-2026'
  const oldSecret = process.env.JWT_SECRET, original = User.findById
  process.env.JWT_SECRET = secret
  const app = express()
  app.get('/protected', requireAuth, (req, res) => res.json({ role: req.user.role }))
  app.get('/public', optionalAuth, (req, res) => res.json({ role: req.user?.role || 'guest' }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    for (const role of ['owner', 'reporter', 'unrelated', 'shelter_admin']) {
      const id = String(new mongoose.Types.ObjectId())
      const token = jwt.sign({ id }, secret)
      const options = { headers: { authorization: `Bearer ${token}` } }
      User.findById = async () => ({ _id: id, role })
      assert.equal((await fetch(`${origin}/protected`, options)).status, 200)
      User.findById = async () => { throw new Error('Fictional driver failure containing private configuration') }
      for (const route of ['/protected', '/public']) {
        const response = await fetch(origin + route, options)
        assert.equal(response.status, 503)
        const payload = await response.json()
        assert.equal(payload.code, 'AUTH_SERVICE_UNAVAILABLE')
        assert.ok(!JSON.stringify(payload).includes('private configuration'))
        assert.ok(!JSON.stringify(payload).includes(token))
      }
      User.findById = async () => null
      assert.equal((await fetch(`${origin}/protected`, options)).status, 401)
    }
    assert.equal((await fetch(`${origin}/protected`)).status, 401)
    assert.equal((await fetch(`${origin}/public`)).status, 200)
    assert.equal((await fetch(`${origin}/protected`, { headers: { authorization: 'Bearer invalid' } })).status, 401)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    User.findById = original
    if (oldSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = oldSecret
  }
})
