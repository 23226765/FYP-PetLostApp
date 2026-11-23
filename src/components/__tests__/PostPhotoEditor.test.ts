import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import PostPhotoEditor from '../PostPhotoEditor.vue'
import PostPhotoGallery from '../PostPhotoGallery.vue'
import { setSessionToken } from '../../services/authSession'
import { i18n } from '../../i18n'

const api = vi.hoisted(() => ({ uploadManagedImage:vi.fn(), replacePostImages:vi.fn(), discardManagedImage:vi.fn() }))
vi.mock('../../services/api', () => api)
enableAutoUnmount(afterEach)
const dog = '/test-photos/dog.jpg', cat = '/test-photos/cat.jpg'
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'en'
  setSessionToken('fictional-local-fixture')
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test')
  api.discardManagedImage.mockResolvedValue(undefined)
})
function render(photos:string[], type:'pet'|'stray'='pet') {
  return mount(PostPhotoEditor,{attachTo:document.body,props:{type,id:'fixture',photos}})
}
async function select(wrapper:ReturnType<typeof render>, names:string[]) {
  const field = wrapper.get('input[type=file]')
  Object.defineProperty(field.element,'files',{configurable:true,value:names.map(name=>new File(['fixture'],name,{type:'image/jpeg'}))})
  await field.trigger('change')
}
it('retains a six-photo post, supports draft-only reordering and cancel with focus return',async()=>{
  const photos = [dog,cat,...['a','b','c','d'].map(id=>'/fixtures/'+id+'.jpg')]
  const wrapper = render(photos,'stray')
  await wrapper.get('.edit').trigger('click')
  expect(wrapper.text()).toContain('6 photos · older post')
  expect(wrapper.get('.add').attributes('disabled')).toBeDefined()
  await wrapper.get('[aria-label="Move photo 2 earlier"]').trigger('click')
  expect(wrapper.get('.thumb img').attributes('src')).toContain(cat)
  await wrapper.get('footer button').trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('.edit').element)
  await wrapper.get('.edit').trigger('click')
  expect(wrapper.get('.thumb img').attributes('src')).toContain(dog)
  expect(api.replacePostImages).not.toHaveBeenCalled()
  expect(api.uploadManagedImage).not.toHaveBeenCalled()
})
it('saves four ordered attachments, rejects a fifth and reuses the successful upload on retry',async()=>{
  const wrapper = render([dog,cat])
  await wrapper.get('.edit').trigger('click')
  await select(wrapper,['three.jpg','four.jpg'])
  await select(wrapper,['five.jpg'])
  expect(wrapper.findAll('.tile')).toHaveLength(4)
  expect(wrapper.text()).toContain('Choose up to four photos')
  await wrapper.get('[aria-label="Move photo 2 earlier"]').trigger('click')
  expect(api.uploadManagedImage).not.toHaveBeenCalled()
  api.uploadManagedImage.mockResolvedValueOnce({id:'third'}).mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({id:'fourth'})
  const saved = [cat,dog,'/fixtures/three.webp','/fixtures/four.webp']
  api.replacePostImages.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce(saved.map(url=>({url})))
  const save = wrapper.get('footer .save')
  await save.trigger('click'); await flushPromises()
  expect(wrapper.get('dialog').element.open).toBe(true)
  expect(wrapper.findAll('.tile')).toHaveLength(4)
  expect(api.replacePostImages).not.toHaveBeenCalled()
  await save.trigger('click'); await flushPromises()
  expect(wrapper.emitted('updated')).toBeUndefined()
  expect(wrapper.get('dialog').element.open).toBe(true)
  await save.trigger('click'); await flushPromises()
  expect(api.uploadManagedImage).toHaveBeenCalledTimes(3)
  expect(api.replacePostImages).toHaveBeenLastCalledWith('pet','fixture',[{existingUrl:cat},{existingUrl:dog},{imageId:'third'},{imageId:'fourth'}])
  expect(wrapper.emitted('updated')).toEqual([[saved.map(url=>({url}))]])
  expect(wrapper.text()).toContain('Photos updated')
  await wrapper.setProps({photos:saved})
  await wrapper.get('.edit').trigger('click')
  expect(wrapper.get('.thumb img').attributes('src')).toContain(cat)
  expect(wrapper.text()).toContain('4 of 4 photos')
})
it('renders one detail photo at a time with controls and horizontal swipe',async()=>{
  const wrapper = mount(PostPhotoGallery,{props:{photo:dog,photos:[dog,cat],alt:'Fictional pet'}})
  expect(wrapper.findAll('img')).toHaveLength(1)
  await wrapper.get('[aria-label="Next photo"]').trigger('click')
  expect(wrapper.get('img').attributes('src')).toContain(cat)
  await wrapper.get('.gallery').trigger('touchstart',{touches:[{clientX:20,clientY:20}]})
  await wrapper.get('.gallery').trigger('touchend',{changedTouches:[{clientX:95,clientY:21}]})
  expect(wrapper.get('img').attributes('src')).toContain(dog)
})

it.each(['en','zh-HK','zh-CN'] as const)('labels the picker and keeps Save unavailable for an empty Rescue draft in %s',async locale=>{
  i18n.global.locale.value = locale
  const wrapper = render([cat],'stray')
  await wrapper.get('.edit').trigger('click')
  expect(wrapper.get('dialog').attributes('aria-label')).toBe(i18n.global.t('postPhotos.edit'))
  expect(wrapper.get('.thumb small').text()).toBe(i18n.global.t('postPhotos.cover'))
  const input = wrapper.get('input[type=file]')
  expect(input.element.hasAttribute('hidden')).toBe(true)
  expect(input.element.hasAttribute('multiple')).toBe(true)
  await wrapper.get('.tools button:last-child').trigger('click')
  expect(wrapper.get('footer .save').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain(i18n.global.t('validation.rescuePhotoRequired'))
  expect(api.replacePostImages).not.toHaveBeenCalled()
})

