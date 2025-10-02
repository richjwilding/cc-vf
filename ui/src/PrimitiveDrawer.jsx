import {Drawer, DrawerContent, DrawerHeader, DrawerBody} from '@heroui/react';
import {Input, ScrollShadow} from '@heroui/react';
import {useState, useMemo} from 'react';
import MainStore from './MainStore';
import {HeroIcon} from './HeroIcon';

export default function PrimitiveDrawer({open, onClose}){
  const mainstore = MainStore();
  const [query, setQuery] = useState('');
  const categories = mainstore.categories();

  const grouped = useMemo(()=>{
    const filtered = categories.filter(c=>
      c.title?.toLowerCase().includes(query.toLowerCase())
    );
    return filtered.reduce((acc,c)=>{
      const key = c.primitiveType || 'other';
      acc[key] = acc[key] || [];
      acc[key].push(c);
      return acc;
    },{});
  }, [categories, query]);

  return (
    <Drawer isOpen={open} placement="right" onClose={onClose} size="sm">
      <DrawerContent className="p-4">
        <DrawerHeader className="pb-2">Add Item</DrawerHeader>
        <DrawerBody className="pt-0">
          <Input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder="Search..."
            className="mb-3"
            size="sm"
          />
          <ScrollShadow className="max-h-80 pr-2">
            {Object.keys(grouped).map(type=>(
              <div key={type} className="mb-4">
                <h3 className="text-xs font-semibold uppercase mb-1">{type}</h3>
                <div className="space-y-1">
                  {grouped[type].map(cat=>(
                    <div
                      key={cat.id}
                      draggable
                      onDragStart={e=>{
                        e.dataTransfer.setData('application/x-category', String(cat.id));
                      }}
                      className="flex items-center p-2 rounded hover:bg-gray-100 cursor-move"
                    >
                      <HeroIcon icon={cat.icon} className="w-5 h-5 mr-2"/>
                      <span className="text-sm">{cat.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </ScrollShadow>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
