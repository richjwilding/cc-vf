import React, { useState, useEffect } from "react";
import { Input, Chip } from "@heroui/react";

export default function TagsInput({ value = [], onChange, ...props }) {
  const [tags, setTags] = useState(value);
  const [input, setInput] = useState("");

  useEffect(()=>{
    setTags(value)
  }, [value])

  const handleKey = e => {
    if (["Enter","Tab",","].includes(e.key)) {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !tags.includes(trimmed)) {
        const next = [...tags, trimmed];
        setTags(next);
        onChange?.(next);
      }
      setInput("");
    }
    if (e.key === "Backspace" && !input) {
      const next = [...new Set(tags.map(t => t.trim().toLowerCase()))];
      setTags(next);
      onChange?.(next);
    }
  };

  const remove = idx => {
    const next = tags.filter((_, i) => i !== idx);
    setTags(next);
    onChange?.(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        {...props}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Type and press Enter, Tab or ','"
      />
      {tags.map((tag, i) => (
        <Chip key={i} onClose={() => remove(i)}>
          {tag}
        </Chip>
      ))}
    </div>
  );
}