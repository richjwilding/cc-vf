import clsx from 'clsx'

export function DescriptionList({ className, inContainer=true, ...props }) {
  return (
    <dl
      {...props}
      className={clsx(
        className,
        'grid grid-cols-1 text-base/6 text-sm/6' ,
        inContainer ? "@md:!grid-cols-[min(40%,theme(spacing.60))_minmax(0,1fr)]" : 'sm:grid-cols-[min(40%,theme(spacing.80))_minmax(0,1fr)]'
      )}
    />
  )
}

export function DescriptionTerm({ className, inContainer = true, ...props }) {
  return (
    <dt
      {...props}
      className={clsx(
        className,
        'col-start-1 border-t border-zinc-950/5 pt-2 text-zinc-500 first:border-none dark:border-white/5 dark:text-zinc-400 ',
        inContainer ? "@md:p-2 @md:border-t @md:border-zinc-950/5 @md:dark:border-white/5" : "sm:py-2 sm:border-t sm:border-zinc-950/5 sm:dark:border-white/5"
      )}
    />
  )
}

export function DescriptionDetails({ className, inContainer = true, ...props }) {
  return (
    <dd
      {...props}
      className={clsx(
        className,
        'pb-2 pt-1 text-zinc-950 dark:text-white',
        inContainer ? "@md:p-2 @md:border-t @md:border-zinc-950/5 @md:[&:nth-child(2)]:border-none dark:@md:border-white/5" : "sm:py-2 sm:border-t sm:border-zinc-950/5 sm:[&:nth-child(2)]:border-none dark:sm:border-white/5"
      )}
    />
  )
}
