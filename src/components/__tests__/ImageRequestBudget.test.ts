import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import RadarScreen from '../RadarScreen.vue'
import StrayRescueScreen from '../StrayRescueScreen.vue'
import ProfileScreen from '../ProfileScreen.vue'
import PetDetail from '../PetDetail.vue'
import type { Pet } from '../../types/pet'

const api = vi.hoisted(() => ({readManagedImage:vi.fn(), getMyPetsPage:vi.fn(), getMySightings:vi.fn(), getPetSightings:vi.fn(), getNearbyStrays:vi.fn()}))
vi.mock('../../services/api', () => api)
const path = (n:number) => '/api/uploads/managed/'+n.toString(16).padStart(24,'0')+'/content'
const user = {id:'owner', name:'Fixture Owner', email:'fixture@example.test', avatar:path(20)}
const pets:Pet[] = Array.from({length:6},(_,i)=>({id:String(i+1),name:'Fixture',species:'Dog',breed:'',photo:path(i+1),owner:'Owner',description:'',canViewContact:false,status:'lost',location:'Sha Tin',locationPrecision:'approximate',lastSeen:'Today',postedAgo:'Today',mapX:50,mapY:50}))
const near = new Map<Element, () => void>()
beforeEach(() => {
  vi.resetAllMocks()
  near.clear()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(el:Element) { near.set(el,()=>this.callback([{isIntersecting:true,target:el} as IntersectionObserverEntry],this as unknown as IntersectionObserver)) }
    disconnect() {}
  })
  api.readManagedImage.mockImplementation(()=>new Promise(()=>{}))
  api.getMyPetsPage.mockResolvedValue({pets,pagination:{page:1,hasMore:false},summary:{total:6,active:6,reunited:0}})
  api.getMySightings.mockResolvedValue([])
  api.getNearbyStrays.mockResolvedValue(pets.map(p=>({...p,author:user,condition:'healthy',district:'Sha Tin',rescueStatus:'reported',createdAt:'2026-10-01'})))
  api.getPetSightings.mockResolvedValue(pets.slice(1,5).map(p=>({id:p.id,photo:p.photo,createdAt:'2026-10-01',locationName:'Fixture'})))
})
enableAutoUnmount(afterEach)
afterEach(()=>vi.unstubAllGlobals())

it.each(['Radar','Rescue','Profile','Detail'])('keeps initial protected reads bounded on %s',async screen=>{
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/profile',name:'profile',component:{template:'<div />'}}]})
  await router.push('/profile')
  const global={plugins:[router],stubs:{MapView:true,SafetyActions:true,RadarAssistant:true}}
  const location={lng:114.17,lat:22.31}
  const wrapper = screen==='Radar' ? mount(RadarScreen,{global,props:{pets,radiusKm:5,breed:'',district:'',species:'All',unreadCount:0,userLocation:location}})
    : screen==='Rescue' ? mount(StrayRescueScreen,{global,props:{user,radiusKm:5,userLocation:location}})
    : screen==='Profile' ? mount(ProfileScreen,{global,props:{user}})
    : mount(PetDetail,{global,props:{pet:pets[0]!,user}})
  await flushPromises()
  // Even before intersections are reported, the lead image has a head start.
  expect(api.readManagedImage.mock.calls.map(([url]) => url)).toEqual([
    path(screen === 'Profile' ? 20 : 1).slice(4),
  ])
  // Simulate one visible card per feed, two grid thumbnails on Profile,
  // and only the hero on Detail. All network responses remain in flight.
  const visible = screen==='Profile' ? '.profile-photo-card:nth-child(-n+2)' : screen==='Rescue' ? '.stray-card:first-child' : screen==='Radar' ? '.feed-card:first-child' : '.hero'
  for(const [el,enter] of near) if(el.closest(visible)) enter()
  await flushPromises()
  expect(api.readManagedImage.mock.calls.length).toBe(({Radar:1,Rescue:2,Profile:3,Detail:1})[screen])
  // Scroll every remaining image into the preload margin before responses finish.
  for (const enter of near.values()) enter()
  await flushPromises()
  expect(api.readManagedImage.mock.calls.length).toBe(({Radar:6,Rescue:7,Profile:7,Detail:5})[screen])
  wrapper.unmount()
})

