import { clsx, type ClassValue } from "clsx";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export const cn = (...values: ClassValue[]) => clsx(values);

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-page hover:bg-white",
  secondary: "border border-line bg-raised text-ink hover:bg-[#322d28]",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
};

const SIZES: Record<Size, string> = {
  md: "h-10 px-4 text-[13px]",
  sm: "h-8 px-3 text-[12.5px]",
  lg: "h-12 px-5 text-[14px]",
  icon: "size-10 p-0",
};

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background-color,color,border-color,transform] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

/** Motion only while something is actually loading; the label stays available to screen readers. */
export function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center justify-center", className)}>
      <LoaderCircle
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        className="text-ink-3 motion-safe:animate-spin"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
