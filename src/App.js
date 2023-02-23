import './App.css';
import MainStore from './MainStore';
import React from 'react';
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { ComponentView } from './ComponentView';
import { Sidebar } from './Sidebar';

import { library } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'
import { faLinkedin } from '@fortawesome/free-brands-svg-icons'
import { PrimitivePage } from './PrimitivePage';


import MainStoreTests from './mainstore_tests';

library.add(fas, faLinkedin)





let mainstore = MainStore()
window.mainstore = mainstore

window.mainstore_tests = MainStoreTests

const PrimitiveCardWrapper = (props) => {
  const { id } = useParams();
  return <PrimitivePage primitive={mainstore.primitive(parseInt(id))} selectPrimitive={props.selectPrimitive} />;
};

function App() {
  
  const [open, setOpen] = React.useState(false)
  const [overlay, setOverlay] = React.useState(false)
  const [primitive, setPrimitive] = React.useState(undefined)

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
    <div className = 'w-full mx-auto flex h-screen'>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ComponentView components={mainstore.components()} selectPrimitive={selectPrimitive}/>}/>
          <Route path="/item/:id" element={<PrimitiveCardWrapper selectPrimitive={selectPrimitive}/>}/>
        </Routes>
      <Sidebar open={open} overlay={overlay} setOpen={(v)=>{console.log(v);setOpen(v)}} primitive={primitive}/>
      </BrowserRouter>
    </div>
  )
}

export default App;
