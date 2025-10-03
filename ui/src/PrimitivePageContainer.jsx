import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import { Spinner } from "@heroui/react";
import MainStore from "./MainStore";
import { PrimitivePage } from "./PrimitivePage";
import PageView from "./PageView";
import AnalysisPage from "./AnalysisPage";
import FlowInstancePage from "./FlowInstancePage";
import BoardViewer from "./BoardViewer";

const mainstore = MainStore();

function renderPrimitiveByType(primitive, props) {
  if (!primitive) {
    return null;
  }

  switch (primitive.type) {
    case "page":
      return <PageView primitive={primitive} {...props} />;
    case "working":
      return <AnalysisPage primitive={primitive} {...props} />;
    case "flow":
      return (
        <div className="h-[calc(100vh_-_4em)] p-4">
          <BoardViewer primitive={primitive} />
        </div>
      );
    case "flowinstance":
      return <FlowInstancePage primitive={primitive} {...props} />;
    default:
      return <PrimitivePage primitive={primitive} {...props} />;
  }
}

export default function PrimitivePageContainer(props) {
  const { id } = useParams();

  const primitive = useMemo(() => {
    if (props.primitive) {
      return props.primitive;
    }

    if (!id) {
      return undefined;
    }

    const parsedId = isNaN(id) ? id : parseInt(id, 10);
    return mainstore.primitive(parsedId);
  }, [id, props.primitive]);

  if (!primitive) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100">
        <Spinner color="primary" label="Loading primitive" />
      </div>
    );
  }

  return renderPrimitiveByType(primitive, props);
}
