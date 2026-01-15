import * as React from "react"
import { cn } from "../../lib/utils"

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

const Sheet = ({ open, onOpenChange, children }: SheetProps) => {
  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false)
      }
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [open, onOpenChange])

  // Prevent body scroll when open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  return <>{children}</>
}

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean
  onClose: () => void
  side?: "left" | "right"
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, children, open, onClose, side = "left", ...props }, ref) => {
    return (
      <>
        {/* Backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onClose}
        />
        {/* Sheet */}
        <div
          ref={ref}
          className={cn(
            "fixed z-50 h-dvh bg-gray-900 shadow-xl transition-transform duration-300 ease-in-out",
            side === "left" ? "left-0 top-0" : "right-0 top-0",
            side === "left"
              ? open ? "translate-x-0" : "-translate-x-full"
              : open ? "translate-x-0" : "translate-x-full",
            "w-[280px] max-w-[85vw]",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </>
    )
  }
)
SheetContent.displayName = "SheetContent"

export { Sheet, SheetContent }
