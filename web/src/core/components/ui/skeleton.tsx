import { cn } from "@/core/lib/utils"

/**
 * A placeholder for something that has not arrived.
 *
 * The sheen replaces the pulse: a block fading in and out reads as a thing
 * that is broken, where a light travelling across it reads as a thing that is
 * working. Both stop under prefers-reduced-motion, and what is left is a
 * plain muted block — which still says "not here yet" without moving.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-sheen rounded-xl bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
