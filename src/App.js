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

library.add(fas, faLinkedin)





let mainstore = MainStore()
window.mainstore = mainstore

const PrimitiveCardWrapper = () => {
  const { id } = useParams();
  return <PrimitivePage primitive={mainstore.primitive(parseInt(id))} />;
};

function App() {
  
  const [open, setOpen] = React.useState(true)
  const [primitive, setPrimitive] = React.useState(undefined)

  const selectPrimitive = (primitive)=>{
    setOpen(true)
    setPrimitive(primitive)
  }

  return (
    <div className = 'max-w-screen-3xl mx-auto flex h-screen'>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ComponentView components={mainstore.components()} selectPrimitive={selectPrimitive}/>}/>
          <Route path="/item/:id" element={<PrimitiveCardWrapper/>}/>
        </Routes>
      </BrowserRouter>
      <Sidebar open={open} setOpen={setOpen} primitive={primitive}/>
    </div>
  )
}

export default App;
