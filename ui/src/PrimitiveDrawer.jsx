import {useEffect, useMemo, useState} from 'react';
import clsx from 'clsx';
import {HeroIcon} from './HeroIcon';
import {Input} from '@heroui/react';

const TYPE_INFO = {
  activity: {
    label: 'Activities',
    description: 'Plan or track research and workflow activities.'
  },
  evidence: {
    label: 'Evidence',
    description: 'Collect supporting facts, quotes, and observations.'
  },
  result: {
    label: 'Results',
    description: 'Capture generated outputs and insights.'
  },
  dataset: {
    label: 'Datasets',
    description: 'Organize structured data for analysis and automation.'
  },
  flow: {
    label: 'Flows',
    description: 'Automate multi-step tasks and trigger actions.'
  },
  page: {
    label: 'Pages',
    description: 'Design layouts and visual presentations.'
  },
  view: {
    label: 'Views',
    description: 'Configure ways to explore or monitor data.'
  }
};

function formatTypeLabel(type){
  if(!type){
    return {label: 'Other', description: ''};
  }
  if(TYPE_INFO[type]){
    return TYPE_INFO[type];
  }
  const friendly = type.replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, l=>l.toUpperCase());
  return {label: friendly, description: ''};
}

export default function PrimitiveDrawer({open, onClose, className, categories = []}){
  const [query, setQuery] = useState('');

  useEffect(()=>{
    if(!open){
      setQuery('');
    }
  }, [open]);

  useEffect(()=>{
    function handleKey(event){
      if(event.key === 'Escape' && open){
        onClose?.();
      }
    }
    window.addEventListener('keydown', handleKey);
    return ()=>window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const groups = useMemo(()=>{
    const q = query.trim().toLowerCase();
    const filtered = categories.filter(category=>{
      if(!q){
        return true;
      }
      const haystack = [category.title, category.description]
        .filter(Boolean)
        .map(value=>value.toLowerCase());
      return haystack.some(value=>value.includes(q));
    });

    const groupedMap = new Map();
    for(const category of filtered){
      const typeKey = category.primitiveType || category.type || 'other';
      if(!groupedMap.has(typeKey)){
        groupedMap.set(typeKey, {
          key: typeKey,
          ...formatTypeLabel(typeKey),
          items: []
        });
      }
      groupedMap.get(typeKey).items.push(category);
    }

    const sortByTitle = (a, b)=>a.title.localeCompare(b.title, undefined, {sensitivity: 'base'});

    return Array.from(groupedMap.values())
      .map(group=>({
        ...group,
        items: group.items.sort(sortByTitle)
      }))
      .sort((a, b)=>a.label.localeCompare(b.label, undefined, {sensitivity: 'base'}));
  }, [categories, query]);

  if(!open){
    return null;
  }

  const hasResults = groups.length > 0;
  const hasBaseCategories = categories.length > 0;

  return (
    <div
      className={clsx(
        'pointer-events-auto w-80 sm:w-96 bg-white shadow-2xl border border-default-200 rounded-2xl flex flex-col overflow-hidden',
        className
      )}
      data-cancel-drop
      onDragOver={event=>{
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={event=>{
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-default-200">
        <div>
          <h2 className="text-sm font-semibold text-default-700">Add Items</h2>
          <p className="text-xs text-default-400">Drag categories onto the canvas to create nodes.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-default-400 hover:text-default-600 hover:bg-default-100 rounded-full transition"
          aria-label="Close add items panel"
        >
          <HeroIcon icon="XMarkIcon" className="w-4 h-4"/>
        </button>
      </div>
      <div className="px-4 py-3 border-b border-default-100">
        <Input
          value={query}
          onChange={event=>setQuery(event.target.value)}
          placeholder="Search categories"
          size="sm"
          radius="lg"
          startContent={<HeroIcon icon="MagnifyingGlassIcon" className="w-4 h-4 text-default-400"/>}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
          {hasResults ? (
            groups.map(group=>(
            <section key={group.key}>
              <header className="mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-default-500">
                  {group.label}
                </h3>
                {group.description && (
                  <p className="text-xs text-default-400 mt-1 leading-snug">
                    {group.description}
                  </p>
                )}
              </header>
              <div className="flex flex-col gap-2">
                {group.items.map(category=>(
                  <div
                    key={category.id}
                    draggable
                    onDragStart={event=>{
                      event.dataTransfer.setData('application/x-category', String(category.id));
                      event.dataTransfer.effectAllowed = 'copyMove';
                    }}
                    className="flex items-start gap-3 rounded-xl border border-transparent hover:border-default-200 hover:bg-default-100 p-3 transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-default-100 text-default-500 shrink-0">
                      <HeroIcon icon={category.icon || 'Squares2X2Icon'} className="w-5 h-5"/>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-default-700">
                        {category.title}
                      </div>
                      {category.description && (
                        <p className="text-xs text-default-400 mt-0.5 line-clamp-2">
                          {category.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-default-400 gap-2">
              <HeroIcon icon="InboxIcon" className="w-10 h-10"/>
              <p className="text-sm font-medium">
                {hasBaseCategories ? 'No categories matched your search.' : 'No categories available for this board.'}
              </p>
              <p className="text-xs">
                {hasBaseCategories ? 'Try a different keyword or reset the filter.' : 'Switch the active board or adjust its type to enable more options.'}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
