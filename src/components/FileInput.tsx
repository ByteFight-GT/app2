"use client";

import React from "react"

import { FolderIcon } from "lucide-react";
import { InputLabel } from "./InputLabel";
import { Button, ButtonProps } from "./Button";

export type FileInputProps = {
  label?: string;
  variant?: ButtonProps["variant"]; // style variant for the button
} & React.ComponentProps<"input">

export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(({
  className = "", 
  style,
  variant = "secondary",
  label,
  name,
  ...rest
}, ref) => {
  const [selectedFile, setSelectedFile] = React.useState<string>("");
  const uniqueName = React.useId(); // used to link label to input if no name provided

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0].name);
    } else {
      setSelectedFile("");
    }
    // Call the original onChange if provided
    rest.onChange?.(e);
  };

  const handleClick = () => {
    const inputId = (rest.id ?? name ?? uniqueName) as string;
    (document.getElementById(inputId) as HTMLInputElement | null)?.click();
  };

  const inputEle = (
    <>
      <input
        ref={ref}
        type="file"
        {...rest}
        id={rest.id ?? name ?? uniqueName}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <Button
      variant={variant}
      className={className}
      style={style}
      type="button"
      onClick={handleClick}>
        <FolderIcon />
        <span className="truncate">{selectedFile || "No file selected"}</span>
      </Button>
    </>
  );

  if (label) {
    return (
      <div>
        <InputLabel htmlFor={name || uniqueName}>
          <p className='text-sm text-secondary-foreground mb-1'>{label}</p>
        </InputLabel>
        {inputEle}
      </div>
    )
  } else {
    return inputEle;
  }
});
FileInput.displayName = "FileInput";
