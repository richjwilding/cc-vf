import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import MainStore from './MainStore';
import AnalysisPage from './AnalysisPage';
import BoardViewer from './BoardViewer';
import FlowInstancePage from './FlowInstancePage';
import { PrimitivePage } from './PrimitivePage';

let mainstore = MainStore();

export function PrimitiveViewRouter({ widePage, setWidePage, selectPrimitive }) {
  const { id } = useParams();
  const primitive = id
    ? mainstore.primitive(isNaN(id) ? id : parseInt(id))
    : undefined;

  useEffect(() => {
    if (!primitive) {
      return;
    }
    if (primitive.type === 'flow' || primitive.type === 'flowinstance') {
      setWidePage?.('always');
      return () => {
        setWidePage?.(false);
      };
    }
    setWidePage?.(false);
  }, [primitive, setWidePage]);

  if (!primitive) {
    return null;
  }

  if (primitive.type === 'working') {
    return <AnalysisPage primitive={primitive} />;
  }

  if (primitive.type === 'flow') {
    return (
      <div className="h-[calc(100vh_-_4em)] p-4">
        <BoardViewer primitive={primitive} />
      </div>
    );
  }

  if (primitive.type === 'flowinstance') {
    return <FlowInstancePage primitive={primitive} />;
  }

  return (
    <PrimitivePage
      key={primitive.id}
      primitive={primitive}
      widePage={widePage}
      setWidePage={setWidePage}
      selectPrimitive={selectPrimitive}
    />
  );
}
