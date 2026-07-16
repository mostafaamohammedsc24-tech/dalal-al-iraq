import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type LazyImageProps = ImgHTMLAttributes<HTMLImageElement>;

export function LazyImage({ className, onLoad, ...props }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      {...props}
      loading="lazy"
      decoding="async"
      onLoad={(e) => { setLoaded(true); onLoad?.(e); }}
      className={cn(
        "transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
