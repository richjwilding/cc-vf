import { useState, useMemo, useReducer, useCallback } from 'react'
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
  Spinner,
} from '@heroui/react'
import CategoryIdSelector from './@components/CategoryIdSelector'
import { HeroIcon } from './HeroIcon'
import { PrimitiveCard } from './PrimitiveCard'
import PrimitiveDetails from './@components/PrimitiveDetails'
import useDataEvent from './CustomHook'
import MainStore from './MainStore'
import ConfirmationPopup from './ConfirmationPopup'

export default function GenericEditor({ primitive, ...props }) {

  const [eventRelationships, updateRelationships] = useReducer((x) => x + 1, 0)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState(
    `Are you sure you want to delete this ${primitive.displayType ?? 'item'}?`
  )
  const [internalOpen, setInternalOpen] = useState(true)
  const [selectorResetKey, setSelectorResetKey] = useState(0)

  useDataEvent(
    'relationship_update set_field set_parameter set_title',
    [primitive.id, primitive.primitives.allUniqueCategory.map((d) => d.id)],
    updateRelationships
  )

  const availableCategories = useMemo(
    () => props.options?.filter(Boolean) ?? [],
    [props.options]
  )

  const list = useMemo(() => {
    if (primitive.metadata?.subCategories === 'inherit') {
      return undefined
    }
    if (props.set) {
      return props.set(primitive)
    }
    return primitive.primitives.allItems
  }, [primitive, props.set, eventRelationships])

  const isOpen = props.setOpen ? true : internalOpen

  const handleClose = useCallback(() => {
    if (props.setOpen) {
      props.setOpen(false)
    } else {
      setInternalOpen(false)
    }
  }, [props.setOpen, setInternalOpen])

  const promptConfirmRemove = useCallback(() => {
    const children = primitive.primitives.uniqueAllItems
    if (children.length > 0) {
      setDeleteMessage(
        `Deletion of this item will also delete ${children.length} child items`
      )
    }
    setConfirmRemove(true)
  }, [primitive, setConfirmRemove, setDeleteMessage])

  const handleRemove = useCallback(async () => {
    setConfirmRemove(false)
    await MainStore().removePrimitive(primitive)
    handleClose()
  }, [handleClose, primitive, setConfirmRemove])

  const copyToClipboard = useCallback(() => {
    const out = primitive.primitives.allUniqueCategory
      .map((d) =>
        `${d.title}${
          d.referenceParameters?.description
            ? `:${d.referenceParameters?.description}`
            : ''
        }`
      )
      .join('|')

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(out)
    }
  }, [primitive])

  const pasteFromClipboard = useCallback(async () => {
    if (!navigator?.clipboard?.readText) {
      return
    }
    const fallbackCategory = availableCategories[0]
    if (!fallbackCategory) {
      return
    }
    const data = await navigator.clipboard.readText()
    if (!data) {
      return
    }
    const items = data.split('|')
    for (const entry of items) {
      if (!entry) {
        continue
      }
      const [title, description] = entry.split(':').map((d) => d.trim())
      await MainStore().createPrimitive({
        categoryId: fallbackCategory.id,
        type: fallbackCategory.primitiveType,
        title,
        parent: primitive,
        referenceParameters: {
          description,
        },
      })
    }
  }, [availableCategories, primitive])

  const waiting =
    primitive.processing?.categorize &&
    primitive.processing?.categorize.status !== 'complete'

  const baseActions = useMemo(() => {
    const defaultActions = props.target
      ? [
          {
            key: 'categorize',
            title: 'Auto discover categories from data',
            handler: async () =>
              await MainStore().doPrimitiveAction(props.target, 'categorize', {
                parent: primitive.id,
                source: primitive.id,
              }),
          },
          {
            key: 'categorize2',
            title: 'Auto discover categories from data (alt)',
            handler: async () =>
              await MainStore().doPrimitiveAction(props.target, 'categorize', {
                parent: primitive.id,
                source: primitive.id,
                alternative: true,
              }),
          },
        ]
      : []

    const extraActions = (props.actions || []).map((action) => ({
      key: action.key,
      title: action.title,
      handler:
        action.action ??
        (async () =>
          await MainStore().doPrimitiveAction(props.target, action.key, {
            parent: primitive.id,
            source: primitive.id,
          })),
    }))

    return [
      ...defaultActions,
      ...extraActions,
      {
        key: 'copy',
        title: 'Copy to clipboard',
        handler: copyToClipboard,
      },
      {
        key: 'create',
        title: 'Create from clipboard',
        handler: pasteFromClipboard,
      },
    ]
  }, [copyToClipboard, pasteFromClipboard, primitive.id, props.actions, props.target])

  const actionHandlers = useMemo(() => {
    const map = new Map()
    baseActions.forEach((action) => map.set(action.key, action.handler))
    return map
  }, [baseActions])

  const handleSelectorChange = useCallback(
    async (selections) => {
      const selection = Array.isArray(selections)
        ? selections[selections.length - 1]
        : undefined
      if (!selection?.categoryId) {
        return
      }
      const categoryId = parseInt(selection.categoryId, 10)
      if (Number.isNaN(categoryId)) {
        return
      }
      const category = availableCategories.find(
        (entry) => String(entry.id) === String(categoryId)
      )
      if (!category) {
        return
      }
      await MainStore().createPrimitive({
        categoryId: category.id,
        type: category.primitiveType,
        title: null,
        parent: primitive,
      })
      setSelectorResetKey((value) => value + 1)
    },
    [availableCategories, primitive]
  )
  if (!primitive) {
    return null
  }

  const listTitle = props.listTitle ?? props.listLabel ?? 'Category items'

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent className="relative max-h-[90vh]">
          <ModalHeader className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-tiny font-semibold uppercase text-default-500">
              {primitive.metadata?.icon && (
                <HeroIcon
                  icon={primitive.metadata.icon}
                  className="h-4 w-4 text-default-400"
                />
              )}
              {primitive.displayType ?? primitive.metadata?.title ?? 'Item'}
            </span>
          </ModalHeader>
          <ModalBody className="space-y-5">
            <div className="space-y-3">
              <PrimitiveCard
                key="title"
                primitive={primitive}
                showEdit
                showId={false}
                major
              />
              {primitive?.metadata?.parameters && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-default-500">
                    Parameters
                  </p>
                  <div className="rounded-large border border-default-200 bg-default-50 p-4">
                    <PrimitiveDetails primitive={primitive} editing fullList />
                  </div>
                </div>
              )}
            </div>

            {availableCategories.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-default-500">
                  Add item
                </p>
                <CategoryIdSelector
                  key={selectorResetKey}
                  allowNone
                  availableCategories={availableCategories}
                  className="w-full"
                  disabled={waiting}
                  item={{ allowNone: true, placeholder: 'Select category' }}
                  onSelectionChange={handleSelectorChange}
                  selectionMode="single"
                  showCount={false}
                />
              </div>
            )}

            {Array.isArray(list) && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-default-500">
                  {listTitle}
                </p>
                <ScrollShadow
                  hideScrollBar
                  orientation="vertical"
                  className="max-h-[50vh] space-y-3 rounded-large border border-default-200 bg-default-50 p-3"
                >
                  {list.length === 0 ? (
                    <div className="flex h-32 items-center justify-center rounded-large border border-dashed border-default-300 bg-default-100 text-sm text-default-500">
                      Nothing to show
                    </div>
                  ) : (
                    list.map((child) => (
                      <PrimitiveCard.Variant
                        key={child.id}
                        primitive={child}
                        showEdit
                        editable
                        listType={props.listType}
                      />
                    ))
                  )}
                </ScrollShadow>
              </div>
            )}

            {(baseActions.length > 0 || list?.length) && (
              <div className="flex flex-wrap items-center gap-2">
                {baseActions.length > 0 && (
                  <Dropdown>
                    <DropdownTrigger>
                      <Button size="sm" variant="bordered">
                        Actions
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Category editor actions"
                      variant="flat"
                      onAction={(key) => {
                        const handler = actionHandlers.get(key)
                        if (handler) {
                          handler()
                        }
                      }}
                    >
                      {baseActions.map((action) => (
                        <DropdownItem key={action.key}>{action.title}</DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                )}
                <Button
                  size="sm"
                  variant="bordered"
                  onPress={async () => {
                    await primitive.removeChildren()
                  }}
                  isDisabled={!list || list.length === 0}
                >
                  Delete all
                </Button>
              </div>
            )}
          </ModalBody>
          <ModalFooter className="flex items-center justify-between">
            <span className="text-tiny text-default-400">#{primitive.plainId}</span>
            <div className="flex items-center gap-2">
              <Button color="danger" onPress={promptConfirmRemove} variant="solid">
                Delete
              </Button>
              <Button color="primary" onPress={handleClose} variant="solid">
                Close
              </Button>
            </div>
          </ModalFooter>
          {waiting && (
            <div className="absolute inset-0 z-50 flex items-center justify-center rounded-large bg-default-200/60 backdrop-blur-sm">
              <Spinner color="primary" />
            </div>
          )}
        </ModalContent>
      </Modal>
      {confirmRemove && (
        <ConfirmationPopup
          title="Confirm deletion"
          confirm={handleRemove}
          message={deleteMessage}
          cancel={() => setConfirmRemove(false)}
        />
      )}
    </>
  )
}
