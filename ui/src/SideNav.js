import { Fragment, useRef, useState } from 'react'
import { Dialog, Menu, Transition } from '@headlessui/react'
import { ArrowDownTrayIcon, Bars3CenterLeftIcon, Bars4Icon, ChevronDoubleDownIcon, ChevronDownIcon, ClockIcon, HomeIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline'
import {
  ChevronRightIcon,
  ChevronUpDownIcon,
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/20/solid'
import MainStore from './MainStore'
import { useLinkClickHandler, useNavigate, useParams } from 'react-router-dom'
import { PrimitiveCard } from './PrimitiveCard'
import PrimitivePicker from './PrimitivePicker'
import UIHelper from './UIHelper'
import { Logo } from './logo'


function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function SideNav(props) {
  const mainstore = MainStore()
  const workspaces = mainstore.activeUser?.info.workspaces.map((d)=>MainStore().workspace(d)).filter(Boolean) ?? []
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pageDetailPane, setPageDetailPane] = useState(false)
  const sizeToggle = props.widePage ? "3xl" : "xl"
  const forceSmall = props.widePage === "always"
  const [showPicker, setShowPicker] = useState(false)
  const searchRef = useRef()
  let primitive
  

  const { id } = useParams();
  if( primitive === undefined && id){
    primitive = MainStore().primitive(isNaN(id) ? id : parseInt(id))
  }

  const navigate = useNavigate()
  const showDetailPaneButton = primitive?.type !== "working"
  const urlPath = window.location.pathname

const navigation = [
  { name: 'Home', onClick: ()=>{navigate('/')}, icon: HomeIcon, current: urlPath === "" || urlPath === "/" },
  mainstore.activeWorkspaceId && !mainstore.activeUser.info.external && { name: 'Project Home', onClick: ()=>{navigate(`/project/${mainstore.activeWorkspaceId}`)}, icon: SparklesIcon, current: urlPath.includes("/project")},
  { name: 'Workflows', onClick: ()=>{navigate('/workflows')}, icon: SparklesIcon, current: urlPath.includes("/workflows")},
  { name: 'Downloads', onClick: ()=>{navigate('/')}, icon: ArrowDownTrayIcon, current: urlPath.includes("/downloads") },
].filter(Boolean)

function setWorkspace(id){
  props.setWorkspace(id)
  if( urlPath.includes("/item/")){
    navigate("/")
  }
}


const mainMenu = navigation.map((item) => (
                  <a
                    key={item.name}
                    onClick={item.onClick || undefined}
                    className={classNames(
                      item.current ? 'bg-ccgreen-200/60 text-gray-900' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                      'group flex items-center rounded-md px-2 py-2 text-sm font-medium cursor-pointer'
                    )}
                    aria-current={item.current ? 'page' : undefined}
                  >
                    <item.icon
                      className={classNames(
                        item.current ? 'text-gray-500' : 'text-gray-400 group-hover:text-gray-500',
                        'mr-3 h-6 w-6 flex-shrink-0'
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </a>
                ))

  const userDropdownMenu = 
                <>
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <a
                          href="#"
                          className={classNames(
                            active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                            'block px-4 py-2 text-sm'
                          )}
                        >
                          Setting
                        </a>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <a
                          href="#"
                          className={classNames(
                            active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                            'block px-4 py-2 text-sm'
                          )}
                        >
                          Settings
                        </a>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <a
                          href="#"
                          className={classNames(
                            active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                            'block px-4 py-2 text-sm'
                          )}
                        >
                          Notifications
                        </a>
                      )}
                    </Menu.Item>
                  </div>
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <a
                          href="/logout"
                          className={classNames(
                            active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                            'block px-4 py-2 text-sm'
                          )}
                        >
                          Logout
                        </a>
                      )}
                    </Menu.Item>
                  </div>
                </>
  return (
    <>
      <div className="min-h-full w-full">
        <Transition.Root show={sidebarOpen} as={Fragment}>
          <Dialog as="div" className={[
                'relative z-40',
                !forceSmall && sizeToggle === "lg" ? "lg:hidden" : "",
                !forceSmall && sizeToggle === "xl" ? "xl:hidden" : "",
                !forceSmall && sizeToggle === "2xl" ? "2xl:hidden" : "",
                !forceSmall && sizeToggle === "3xl" ? "3xl:hidden" : "",
            ].join(" ")} onClose={setSidebarOpen}>
            <Transition.Child
              as={Fragment}
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
            </Transition.Child>

            <div className="fixed inset-0 z-40 flex">
              <Transition.Child
                as={Fragment}
                enter="transition ease-in-out duration-300 transform"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transition ease-in-out duration-300 transform"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel className="relative flex w-full max-w-xs flex-1 flex-col bg-white pb-4 pt-5">
                  <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <div className="absolute right-0 top-0 -mr-12 pt-2">
                      <button
                        type="button"
                        className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span className="sr-only">Close sidebar</span>
                        <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                      </button>
                    </div>
                  </Transition.Child>
                  <div className="flex items-center px-3 pt-2 pb-5">
                    <Logo className='w-6 h-6 shrink-0 mr-1'/>
                    <p className="font-['Poppins'] font-black font-family-[Poppins] text-xl">SENSE</p>
                  </div>
                  <div className="h-0 flex-1 overflow-y-auto">
                    <nav className="px-2">
                      <div className="space-y-3 relative">
                      <UIHelper.OptionList
                    name="workspace"
                    zIndex="50"
                    value={props.workspace}
                    placeholder="Project..."
                    onChange={setWorkspace}
                    options={workspaces.map(d=>({
                      title: <><span className={classNames(`bg-${d.color}-500`, 'inline-flex shrink-0 mr-4 h-2.5 w-2.5 rounded-full')} aria-hidden="true"/><span>{d.title}</span></>, 
                      id: d.id
                    }))}
                    />
                        <a
                          key='search'
                          onClick={()=>setShowPicker(true)}
                          className={classNames(
                            'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                            'group flex items-center rounded-md px-2 py-2 text-sm font-medium cursor-pointer'
                          )}
                        >
                          <MagnifyingGlassIcon
                            className={classNames(
                              'text-gray-400 group-hover:text-gray-500',
                              'mr-3 h-6 w-6 flex-shrink-0'
                            )}
                            aria-hidden="true"
                          />
                          Search
                        </a>
                        {mainMenu}
                      </div>
                    </nav>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
              <div className="w-14 flex-shrink-0" aria-hidden="true">
                {/* Dummy element to force sidebar to shrink to fit close icon */}
              </div>
            </div>
          </Dialog>
        </Transition.Root>

        {/* Static sidebar for desktop */}
        <div className={
            //`hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-gray-100 lg:pb-4 lg:pt-5`
            [
                `hidden fixed inset-y-0 w-64 flex-col border-r border-gray-200 pb-4 pt-5`,
                'bg-gradient-to-b from-white via-white to-gray-50',
                !forceSmall && sizeToggle === "lg" ? "lg:flex" : "",
                !forceSmall && sizeToggle === "xl" ? "xl:flex" : "",
                !forceSmall && sizeToggle === "2xl" ? "2xl:flex" : "",
                !forceSmall && sizeToggle === "3xl" ? "3xl:flex" : "",
            ].join(" ")

            }>
          <div className="flex items-center px-3 pt-2 pb-5">
              <Logo className='w-8 h-8 shrink-0 mr-1'/>
              <p className="font-['Poppins'] font-black font-family-[Poppins] text-2xl">SENSE</p>
          </div>
          <div className="mt-5 flex h-0 flex-1 flex-col overflow-y-auto pt-1 px-3 space-y-4">
          <UIHelper.OptionList
                    name="workspace"
                    zIndex="50"
                    value={props.workspace}
                    placeholder="Project..."
                    onChange={setWorkspace}
                    options={workspaces.map(d=>({
                      title: <><span className={classNames(`bg-${d.color}-500`, 'inline-flex shrink-0 mr-4 h-2.5 w-2.5 rounded-full')} aria-hidden="true"/><span>{d.title}</span></>, 
                      id: d.id
                    }))}
                    />
            {/* Sidebar Search */}
            <div className="mt-5 ">
              <label htmlFor="search" className="sr-only">
                Search
              </label>
              <div className="relative mt-1 rounded-md shadow-sm">
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
                  aria-hidden="true"
                >
                  <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  type="text"
                  name="search"
                  ref={searchRef}
                  id="search"
                  onKeyDown={()=>setShowPicker(true)}
                  className="block w-full rounded-md border-0 py-1.5 pl-9 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-ccgreen-600 focus:outline-none sm:text-sm sm:leading-6"
                  placeholder="Search"
                />
              </div>
            </div>
            {/* Navigation */}
            <nav >
              <div className="space-y-1">
                {mainMenu}
              </div>
            </nav>
            <div className='flex flex-col !mt-auto space-y-4'>
              <div className='bg-slate-100 rounded-lg p-3 text-slate-700 text-sm border'>
                <span>Credits:<strong>Unlimited</strong></span>
              </div>
              <UIHelper.Dropdown
                anchor="top end"
                className="justify-around "
                title={<span className="flex min-w-0 items-center justify-between space-x-3">
                        <img
                          className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-300"
                          referrerPolicy="no-referrer"
                          src={MainStore().activeUser.info.avatarUrl}
                          alt=""
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-gray-900">{MainStore().activeUser.info.name}</span>
                          <span className="truncate text-sm text-gray-500">{(MainStore().activeUser.info.email || "").replace(/.+@/,"")}</span>
                        </span>
                      </span>}
                options={[
                  {title: "Account Details", id:"Account"},
                  {title: "Logout", id:"logout"},
                ]}/>
              </div>
          </div>
        </div>
        {/* Main column */}
        <div className={[
                'flex flex-col h-screen',
                !forceSmall && sizeToggle === "lg" ? "lg:pl-64" : "",
                !forceSmall && sizeToggle === "xl" ? "xl:pl-64" : "",
                !forceSmall && sizeToggle === "2xl" ? "2xl:pl-64" : "",
                !forceSmall && sizeToggle === "3xl" ? "3xl:pl-64" : "",
            ].join(" ")}>
          {/* Search header */}
          <div className={[
            'sticky top-0 z-20 flex h-16 flex-shrink-0 border-b border-gray-200 bg-white overflow-x-hidden',
              !forceSmall && sizeToggle === "lg" ? "lg:hidden" : "",
              !forceSmall && sizeToggle === "xl" ? "xl:hidden" : "",
              !forceSmall && sizeToggle === "2xl" ? "2xl:hidden" : "",
              !forceSmall && sizeToggle === "3xl" ? "3xl:hidden" : "",
            ].join(" ")}>
            <button
              type="button"
              className="border-r border-gray-200 px-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ccgreen-500"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3CenterLeftIcon className="h-6 w-6" aria-hidden="true" />
            </button>
            <div className="flex flex-1 justify-between px-4 sm:px-2 lg:px-4">
              {showDetailPaneButton && <button

                type="button"
                className="px-2 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ccgreen-500"
                onClick={() => setPageDetailPane(!pageDetailPane)}
              >
              <ChevronDownIcon className={`h-6 w-6 ${pageDetailPane ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>}
              <div className="flex flex-1">
                {primitive && <PrimitiveCard.Banner primitive={primitive} small showMenu={true} showStateAction={false}  className='pl-4 pr-6 w-full '/>}
              <PrimitiveCard.ProcessingBase primitive={primitive}/>
              </div>
              <div className="flex items-center">
                {/* Profile dropdown */}
                <Menu as="div" className="relative ml-3">
                  <div>
                    <Menu.Button className="flex max-w-xs items-center rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ccgreen-500 focus:ring-offset-2">
                      <span className="sr-only">Open user menu</span>
                      <img
                        className="h-8 w-8 rounded-full"
                        referrerPolicy="no-referrer"
                        src={MainStore().activeUser.info.avatarUrl}
                        alt=""
                      />
                    </Menu.Button>
                  </div>
                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items className="absolute right-0 z-20 mt-2 w-48 origin-top-right divide-y divide-gray-200 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        {userDropdownMenu}
                    </Menu.Items>
                  </Transition>
                </Menu>
              </div>
            </div>
          </div>
              {props.children instanceof Function ? props.children({
                  primitive: primitive,
                  hideBanner: forceSmall,
                  showDetailPane: pageDetailPane,
                  bannerClassName: `hidden ${sizeToggle}:flex`

              }) : props.children}
        </div>
      </div>
      {showPicker && <PrimitivePicker  type={showPicker.type} callback={(p)=>{setTimeout(()=>searchRef.current?.blur(),100);MainStore().sidebarSelect(p)}} setOpen={()=>setShowPicker(null)} />}
    </>
  )
}
