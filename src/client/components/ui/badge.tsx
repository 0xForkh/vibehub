import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-blue-600 text-white shadow",
        secondary:
          "border-transparent bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-white",
        destructive:
          "border-transparent bg-red-600 text-white shadow",
        outline: "text-gray-600 border-gray-300 dark:text-gray-300 dark:border-gray-600",
        success:
          "border-transparent bg-green-600 text-white shadow",
        warning:
          "border-transparent bg-yellow-600 text-white shadow",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
