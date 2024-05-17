export default function SmallButton({title, icon: Icon, active, error, action, ...props}){

    return (<>
              <div
                type="button"
                className={[
                    'text-xs ml-2 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                    active ? "bg-ccgreen-100 border-ccgreen-600 text-ccgreen-800 border" : 
                    error ? "bg-red-100 border-red-600 text-red-800 border" : "bg-white text-gray-400"
                ].join(" ")}
                onClick={action}>
                {Icon && <Icon className='w-4 h-4'/>}
                {title && title}
              </div>
             </>)
}