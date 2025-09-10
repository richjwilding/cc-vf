import { Button as BaseButton } from "@heroui/button";
import { extendVariants } from "@heroui/system";

export const IconButton = extendVariants(BaseButton, {
  variants: {
    size: {
      xs: "px-0.5 min-w-6 h-6 text-tiny gap-1 rounded-full",
    },
  },
  
  defaultVariants: {
    size: "xs",
    isIconOnly: true,
    variant: "iconlight",
    color:"main"
  },
  compoundVariants: [
    {
      color: "olive",
      class: "bg-[#84cc16]/80 opacity-100",
    },
    {
      variant: "iconlight",
      color: "main",
      class: "!text-default-400 hover:!text-default-500 hover:bg-default-100 bg-transparent",
    },
    {
      variant: "iconlight",
      color: "primary",
      class: "!text-primary-400 hover:!text-primary-500 hover:bg-primary-100 bg-transparent",
    },
    {
      variant: "iconlight",
      color: "secondary",
      class: "!text-secondary-400 hover:!text-secondary-500 hover:bg-secondary-100 bg-transparent",
    },
    {
      variant: "iconlight",
      color: "danger",
      class: "!text-danger-400 hover:!text-danger-500 hover:bg-danger-100 bg-transparent",
    },
    {
      variant: "iconlight",
      color: "success",
      class: "!text-success-400 hover:!text-success-500 hover:bg-success-100 bg-transparent",
    },
  ],// make overrides only when variant is "light"
});