import { useEffect, useState } from "react";
import { GripVerticalIcon } from "lucide-react";
import { Button } from "@/components";
import { useWindowResize } from "@/hooks";

export const DragButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { resizeWindow } = useWindowResize();

  useEffect(() => {
    resizeWindow(isOpen);
  }, [isOpen, resizeWindow]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`-ml-[2px] w-fit`}
      data-tauri-drag-region={true}
    >
      <GripVerticalIcon className="h-4 w-4" />
    </Button>
  );
};
