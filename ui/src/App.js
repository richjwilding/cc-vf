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
    !loaded ? <p>Loading</p> : 
      <div className = 'w-full mx-auto flex h-screen'>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<SignIn/>}/>
              <Route path="/components" element={<ComponentView components={Object.values(mainstore.primitives().filter((d)=>d.type==='assessment')[0].framework.components)} selectPrimitive={selectPrimitive}/>}/>
              <Route path="/" element={<SideNav><HomeScreen/></SideNav>}/>
              <Route path="/item/:id" element={<SideNav key='sidebar' widePage={widePage}><PrimitivePage setWidePage={setWidePage} selectPrimitive={selectPrimitive}/></SideNav>}/>
            </Routes>
          <Sidebar open={open} overlay={true} setOpen={(v)=>{selectPrimitive(null)}} primitive={primitive} {...(sidebarOptions ||{})}/>
          </BrowserRouter>
      </div>
  )
}

export default App;
