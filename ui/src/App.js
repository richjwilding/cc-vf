import './App.css';
import MainStore from './MainStore';
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { ComponentView } from './ComponentView';
import { Sidebar } from './Sidebar';
import { library } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'
import { faLinkedin } from '@fortawesome/free-brands-svg-icons'
import { PrimitivePage } from './PrimitivePage';
import MainStoreTests from './mainstore_tests';
import SideNav from './SideNav';
import SignIn from './SignIn';
import HomeScreen from './HomeScreen';

library.add(fas, faLinkedin)




let mainstore = MainStore()
window.mainstore = mainstore

window.mainstore_tests = MainStoreTests


function App() {
  
  const [loaded, setLoaded] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [overlay, setOverlay] = React.useState(false)
  const [primitive, setPrimitive] = React.useState(undefined)
  const [sidebarOptions, setSidebarOptions] = React.useState(undefined)
  const [widePage, setWidePage] = React.useState(false)

  useEffect(()=>{
    mainstore.loadControl = setLoaded
    mainstore.loadData().then(res => {
      setLoaded(true)
    })
  }, [])

  const selectPrimitive = (primitive, options)=>{
    if( primitive === null){
      setOpen(false)
      setOverlay(false)
      return
    }
    setOpen(true)
    setOverlay(overlay)
    setPrimitive(primitive)
    setSidebarOptions(options)
  }

  return (
    !loaded
    ? <div role="status" className='w-full h-screen flex justify-center place-items-center'>
        <svg aria-hidden="true" class="w-20 h-20 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
            <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
        </svg>
        <span class="sr-only">Loading...</span>
    </div> 
    
    : <div className = 'w-full mx-auto flex h-screen'>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<SignIn/>}/>
              <Route path="/" element={<SideNav><HomeScreen/></SideNav>}/>
              <Route path="/item/:id" element={<SideNav key='sidebar' widePage={widePage}><PrimitivePage setWidePage={setWidePage} selectPrimitive={selectPrimitive}/></SideNav>}/>
            </Routes>
          <Sidebar open={open} overlay={true} setOpen={(v)=>{selectPrimitive(null)}} primitive={primitive} {...(sidebarOptions ||{})}/>
          </BrowserRouter>
      </div>
  )
}

export default App;
