import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react'
import { useCallback, useMemo, useState } from 'react'

const HERO_UI_COLORS = new Set([
  'default',
  'primary',
  'secondary',
  'success',
  'warning',
  'danger',
  'foreground',
])

export default function ConfirmationPopup(props) {
  const {
    title = 'Confirmation',
    message = 'No message',
    confirmText = 'Delete',
    confirmColor,
    confirm,
    cancel,
  } = props

  const [isOpen, setIsOpen] = useState(true)

  const resolvedButtonColor = useMemo(() => {
    if (confirmColor && HERO_UI_COLORS.has(confirmColor)) {
      return confirmColor
    }
    if (!confirmColor) {
      return 'danger'
    }
    return undefined
  }, [confirmColor])

  const customColorClass = useMemo(() => {
    if (!confirmColor || HERO_UI_COLORS.has(confirmColor)) {
      return ''
    }
    if (confirmColor === 'indigo') {
      return 'bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-500'
    }
    return `bg-${confirmColor}-600 text-white hover:bg-${confirmColor}-500`
  }, [confirmColor])

  const closeModal = useCallback(() => {
    setIsOpen(false)
    cancel?.()
  }, [cancel])

  const handleConfirm = useCallback(async () => {
    if (!confirm) {
      closeModal()
      return
    }
    const result = await confirm()
    if (result !== false) {
      closeModal()
    }
  }, [closeModal, confirm])

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      hideCloseButton
      placement="center"
      backdrop="opaque"
      classNames={{
        wrapper: 'z-[2000]',
        base: 'z-[2001]',
        backdrop: 'z-[1999] backdrop-blur-sm',
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 text-lg font-semibold">
          {title}
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-500">{message}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={closeModal}>
            Cancel
          </Button>
          <Button
            color={resolvedButtonColor}
            className={customColorClass || undefined}
            onPress={handleConfirm}
          >
            {confirmText}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
