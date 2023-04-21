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

library.add(fas, faLinkedin)




let mainstore = MainStore()
window.mainstore = mainstore

window.mainstore_tests = MainStoreTests


function App() {
  
  const [loaded, setLoaded] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [overlay, setOverlay] = React.useState(false)
  const [primitive, setPrimitive] = React.useState(undefined)
  const [widePage, setWidePage] = React.useState(false)

  useEffect(()=>{
    mainstore.loadData().then(res => {
      setLoaded(true)
    })
  }, [])

  const PrimitiveCardWrapper = (props) => {
    const { id } = useParams();
    return <PrimitivePage primitive={mainstore.primitiveByPlain(parseInt(id))} selectPrimitive={props.selectPrimitive} setWidePage={setWidePage} />;
  };

  const selectPrimitive = (primitive, overlay = false)=>{
    if( primitive === null){
      setOpen(false)
      setOverlay(false)
      return
    }
    setOpen(true)
    setOverlay(overlay)
    setPrimitive(primitive)
  }

  return (
    !loaded ? <p>Loading</p> : 
    !mainstore.activeUser
      ? <SignIn/>
      : <div className = 'w-full mx-auto flex h-screen'>
        <SideNav widePage={widePage}>
          <BrowserRouter>
            <Routes>
              <Route path="/components" element={<ComponentView components={mainstore.components()} selectPrimitive={selectPrimitive}/>}/>
              <Route path="/item/:id" element={<PrimitiveCardWrapper selectPrimitive={selectPrimitive}/>}/>
            </Routes>
          <Sidebar open={open} overlay={overlay} setOpen={(v)=>{console.log(v);setOpen(v)}} primitive={primitive}/>
          </BrowserRouter>
        </SideNav>
      </div>
  )
}

export default App;
