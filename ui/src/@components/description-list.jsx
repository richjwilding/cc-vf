import clsx from 'clsx'

export function DescriptionList({ className, ...props }) {
  return (
    <dl
      {...props}
      className={clsx(
        className,
        'grid grid-cols-1 text-base/6 text-sm/6' ,
        props.inContainer ? "@xl:!grid-cols-[min(40%,theme(spacing.40))_auto]" : 'sm:grid-cols-[min(40%,theme(spacing.80))_auto]'
      )}
    />
  )
}

export function DescriptionTerm({ className, ...props }) {
  return (
    <dt
      {...props}
      className={clsx(
        className,
        'col-start-1 border-t border-zinc-950/5 pt-3 text-zinc-500 first:border-none dark:border-white/5 dark:text-zinc-400 ',
        props.inContainer ? "@xl:py-3 @xl:border-t @xl:border-zinc-950/5 @xl:dark:border-white/5" : "sm:py-3 sm:border-t sm:border-zinc-950/5 sm:dark:border-white/5"
      )}
    />
  )
}

export function DescriptionDetails({ className, ...props }) {
  return (
    <dd
      {...props}
      className={clsx(
        className,
        'pb-3 pt-1 text-zinc-950 dark:text-white',
        props.inContainer ? "@xl:py-3 @xl:border-t @xl:border-zinc-950/5 @xl:[&:nth-child(2)]:border-none dark:@xl:border-white/5" : "sm:py-3 sm:border-t sm:border-zinc-950/5 sm:[&:nth-child(2)]:border-none dark:sm:border-white/5"
      )}
    />
  )
}
