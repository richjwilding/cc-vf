import './App.css';
import MainStore from './MainStore';
import React, { useEffect, useReducer } from 'react';
import { BrowserRouter, Routes, Route, useParams, Outlet } from "react-router-dom";
import { ComponentView } from './ComponentView';
import { Sidebar } from './Sidebar';
import { library } from '@fortawesome/fontawesome-svg-core'
//import { fas } from '@fortawesome/free-solid-svg-icons'
import { faLinkedin } from '@fortawesome/free-brands-svg-icons'
import { faTags, faFilter } from '@fortawesome/pro-light-svg-icons';
import { faRobot, faTrash, faChevronDown, faCircleInfo, faSpider, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { PrimitivePage } from './PrimitivePage';
import SideNav from './SideNav';
import SignIn from './SignIn';
import HomeScreen from './HomeScreen';
import toast, { Toaster } from 'react-hot-toast';
import ConfirmationPopup from './ConfirmationPopup';
import PrimitivePicker from './PrimitivePicker';
import { InputPopup } from './InputPopup';
import CollectionUtils from './CollectionHelper';
import test from './tests/filter.js';
import NewPrimitive from './NewPrimitive.js';
import Popup from './Popup.js';
import GenericEditor from './CategoryEditor.js';
import PrimitiveConfig from './PrimitiveConfig.js';
import FlowInstancePage from './FlowInstancePage.js';
import WorkflowDashboard from './WorkflowDashboard.js';
import { HeroUIProvider } from '@heroui/system';
import SignupPage from './SignUp.js';
import { PrimitivePopup } from './PrimitivePopup.js';
import ResetPasswordPage from './ResetPassword.js';
import ProjectScreen from './ProjectScreen.js';
import UsageScreen from './UsageScreen.js';
import { QueuePage } from './QueuePage.jsx';
import AccountScreen from './AccountScreen.js';

library.add(faTags, faRobot, faTrash, faChevronDown, faLinkedin, faFilter, faCircleInfo, faSpinner, faTriangleExclamation)




let mainstore = MainStore()
window.mainstore = mainstore

window.pc = PrimitiveConfig
window.mainstore_tests = test// MainStoreTests

window.p = (d)=>mainstore.primitive(d)

function App() {
  const [loaded, setLoaded] = React.useState(false)
  const [loadStatus, setLoadStatus] = React.useState(mainstore.loadStatus)
  const [open, setOpen] = React.useState(false)
  const [overlay, setOverlay] = React.useState(false)
  const [primitive, setPrimitive] = React.useState(undefined)
  const [sidebarOptions, setSidebarOptions] = React.useState(undefined)
  const [widePage, setWidePage] = React.useState(false)
  const [showDeletePrompt, setShowDeletePrompt] = React.useState()
  const [showPicker, setShowPicker] = React.useState()
  const [manualInputPrompt, setManualInputPrompt] = React.useState(false)
  const [showNew, setShowNew] = React.useState(false)
  const [showCategoryPicker, setShowCategoryPicker] = React.useState()
  const [update, forceUpdate] = useReducer((x)=>x + 1,0)
  const [showEditCategory, setShowEditCategory] = React.useState()
  const [showPrimitivePopup, setShowPrimitivePopup] = React.useState()


  const checkPrimIsLoaded = ()=>{
    if( window.location.pathname.slice(0, '/item/'.length ) == '/item/'){
      const id = window.location.pathname.slice('/item/'.length )
      if( mainstore.primitive(id) === undefined){
        console.log("NOT LOADED")
        return id
      }
    }
    return true
  }

  useEffect(()=>{
    mainstore.loadControl = setLoaded
    const progressHandler = (status)=>setLoadStatus({...status})
    mainstore.onLoadProgress = progressHandler
    mainstore.loadData().then(res => {
      const passOrId = checkPrimIsLoaded()
      if( passOrId === true ){
        setLoaded(true)
      }else{
        mainstore.loadWorkspaceFor(passOrId).then(data => {
          setLoaded(true)
        })
      }
    })
    return ()=>{
      if( mainstore.onLoadProgress === progressHandler ){
        mainstore.onLoadProgress = undefined
      }
    }
  }, [])
/*  useEffect(() => {
    const handleGestureStart = (e) => {
      e.preventDefault();
    };

    const handleGestureChange = (e) => {
      e.preventDefault();
    };

    
    document.addEventListener('gesturestart', handleGestureStart);
    document.addEventListener('gesturechange', handleGestureChange);

    return () => {
      document.removeEventListener('gesturestart', handleGestureStart);
      document.removeEventListener('gesturechange', handleGestureChange);
    };
  }, []); // Empty dependency array means this effect runs once on mount and once on unmount
              */

  const selectPrimitive = (primitive, options)=>{
    console.log(primitive)
    if( primitive === null){
      setOpen(false)
      setOverlay(false)
      return
    }
    if( !(primitive instanceof Object) ){
      primitive = mainstore.primitive(primitive)
    }
    setOpen(true)
    setOverlay(overlay)
    setPrimitive(primitive)
    setSidebarOptions(options)
  }

  mainstore.sidebarSelect = selectPrimitive
  mainstore.promptDelete = setShowDeletePrompt
  mainstore.globalPicker = setShowPicker
  mainstore.globalInputPopup = setManualInputPrompt
  mainstore.globalNewPrimitive = setShowNew
  mainstore.globalCategoryPicker = setShowCategoryPicker
  mainstore.globalCategoryEditor = setShowEditCategory
  mainstore.primitivePopup = (d)=>{
    const primitive = (typeof(d) === "string" || typeof(d) === "number") ? mainstore.primitive(d) : d
    if( d ){
      setShowPrimitivePopup(primitive)
    }
  }
    
  const id = window.location.pathname.match(/^\/item\/([a-fA-F0-9]{24})(?=\/|$)/)?.[1]
  const pagePrimitive = mainstore.primitive(id)
  console.log(`App got ${id}`)

  function setWorkspace(workspace){
    mainstore.setActiveWorkspace(workspace)
    forceUpdate()
  }
  const allowFixedSidebar = !(pagePrimitive?.type == "flow" || pagePrimitive?.type == "flowinstance")

  return (<HeroUIProvider>
    {!loaded
    ? <div role="status" className='w-full h-screen flex flex-col justify-center place-items-center'>
        <svg aria-hidden="true" className="w-20 h-20 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
            <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
        </svg>
        <span className="sr-only">Loading...</span>
        {loadStatus?.message && <p className="mt-6 text-sm text-gray-500 text-center px-6">{loadStatus.message}</p>}
        {loadStatus?.total ? <p className="text-xs text-gray-400">{`${loadStatus.current ?? 0} / ${loadStatus.total}`}</p> : null}
    </div>
    
    : <div className = 'w-full mx-auto flex h-screen'>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<SignIn/>}/>
              <Route path="/signup" element={<SignupPage/>}/>
              <Route path="/reset/:id" element={<ResetPasswordPage/>}/>
              <Route path="/" element={<SideNav workspace={mainstore.activeWorkspaceId} setWorkspace={setWorkspace}>
                <HomeScreen workspace={mainstore.activeWorkspaceId} setWorkspace={setWorkspace}/>
              </SideNav>}/>
              <Route path="/published/new_instance/:id" element={<FlowInstancePage />}/>
              <Route element={
                <SideNav key='sidebar' widePage={widePage} workspace={mainstore.activeWorkspaceId} setWorkspace={setWorkspace}>
                    <Toaster 
                      position="bottom-right"
                      reverseOrder={true}
                      gutter={8}
                      containerClassName=""
                      toastOptions={{
                        className: '',
                        style: {
                          background: '#f3fcf6',
                          border:'1px solid #00d967'
                        }}}
                    />
                    <Outlet/>
                </SideNav>}>
                  <Route path="/workflow/:id/new_instance" element={<FlowInstancePage />}/>
                  <Route path="/usage/" element={<UsageScreen />}/>
                  <Route path="/account/" element={<AccountScreen/>}/>
                  <Route path="/queue/:id?" element={<QueuePage />}/>
                  <Route path="/workflows/:id?" element={<WorkflowDashboard widePage={widePage} setWidePage={setWidePage}/>}/>
                  <Route path="/item/:id" element={<PrimitivePage key={`${mainstore.activeWorkspaceId}-${pagePrimitive?.id}`} widePage={widePage} setWidePage={setWidePage} selectPrimitive={selectPrimitive}/>}/>
                  <Route path="/project/:id" element={<ProjectScreen/>}/>
                </Route>
            </Routes>
          <Sidebar open={open} fixed={allowFixedSidebar} overlay={true} setOpen={(v)=>{selectPrimitive(null)}} primitive={primitive} {...(sidebarOptions ||{})}/>
          {showDeletePrompt && <ConfirmationPopup title={showDeletePrompt.title ?? "Confirm deletion"} message={showDeletePrompt.prompt} confirm={showDeletePrompt.handleDelete} cancel={()=>setShowDeletePrompt(false)}/>}
          {showPicker && <PrimitivePicker {...showPicker} setOpen={setShowPicker} />}
          {manualInputPrompt && <InputPopup cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
          {showNew && <NewPrimitive {...showNew} done={showNew.callback ? (data)=>showNew.callback(data) : undefined} cancel={()=>setShowNew(false)}/>}
          {showCategoryPicker && <Popup padding='false' setOpen={()=>setShowCategoryPicker(false)}><NewPrimitive.CategorySelection  setOpen={()=>setShowCategoryPicker(false)} categoryId={showCategoryPicker.categoryIds} setSelectedCategory={(d)=>{const r = showCategoryPicker.callback(d); if(r){setShowCategoryPicker()}}}/></Popup>}
          {showEditCategory && <GenericEditor target={showEditCategory.originTask} set={(p)=>showEditCategory.primitive.primitives.allCategory} listType='category_pill' options={MainStore().categories().filter((d)=>[32].includes(d.id))} primitive={showEditCategory.primitive} setOpen={()=>setShowEditCategory(null)}/> }
          {showPrimitivePopup && <PrimitivePopup primitive={showPrimitivePopup} editing={true} setPrimitive={setShowPrimitivePopup}/>}
          </BrowserRouter>
      </div>}
  </HeroUIProvider>)
}

export default App;
