import type { ReactNode } from 'react'
import * as CM from '@radix-ui/react-context-menu'
import * as DM from '@radix-ui/react-dropdown-menu'
import { ChevronRight } from 'lucide-react'
import type { MenuAction } from './menuActions'

const menuCls =
  'z-50 min-w-[200px] overflow-hidden max-sm:min-w-[230px] rounded-xl border border-line bg-panel p-1 shadow-2xl'
const itemCls =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-lg px-2.5 text-[13px] outline-none max-sm:h-11 max-sm:px-3 max-sm:text-[15px] data-[highlighted]:bg-hover data-[disabled]:opacity-40'

function CMItems({ items }: { items: MenuAction[] }): React.JSX.Element {
  return (
    <>
      {items.map((a, i) =>
        a.separator ? (
          <CM.Separator key={i} className="my-1 h-px bg-line" />
        ) : a.sub ? (
          <CM.Sub key={i}>
            <CM.SubTrigger className={itemCls}>
              {a.label}
              <ChevronRight className="ml-auto h-4 w-4" />
            </CM.SubTrigger>
            <CM.Portal>
              <CM.SubContent className={menuCls}>
                <CMItems items={a.sub} />
              </CM.SubContent>
            </CM.Portal>
          </CM.Sub>
        ) : (
          <CM.Item
            key={i}
            className={itemCls + (a.danger ? ' text-danger' : '')}
            disabled={a.disabled}
            onSelect={a.onSelect}
          >
            {a.label}
          </CM.Item>
        )
      )}
    </>
  )
}

function DMItems({ items }: { items: MenuAction[] }): React.JSX.Element {
  return (
    <>
      {items.map((a, i) =>
        a.separator ? (
          <DM.Separator key={i} className="my-1 h-px bg-line" />
        ) : a.sub ? (
          <DM.Sub key={i}>
            <DM.SubTrigger className={itemCls}>
              {a.label}
              <ChevronRight className="ml-auto h-4 w-4" />
            </DM.SubTrigger>
            <DM.Portal>
              <DM.SubContent className={menuCls}>
                <DMItems items={a.sub} />
              </DM.SubContent>
            </DM.Portal>
          </DM.Sub>
        ) : (
          <DM.Item
            key={i}
            className={itemCls + (a.danger ? ' text-danger' : '')}
            disabled={a.disabled}
            onSelect={a.onSelect}
          >
            {a.label}
          </DM.Item>
        )
      )}
    </>
  )
}

/** Right-click menu. `actions` is a function so it reads fresh state when opened. */
export function ContextMenu({
  actions,
  children
}: {
  actions: () => MenuAction[]
  children: ReactNode
}): React.JSX.Element {
  return (
    <CM.Root>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content className={menuCls}>
          <CMItems items={actions()} />
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  )
}

/** "…" button menu. */
export function DropdownMenu({
  actions,
  children
}: {
  actions: () => MenuAction[]
  children: ReactNode
}): React.JSX.Element {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>{children}</DM.Trigger>
      <DM.Portal>
        <DM.Content className={menuCls} align="end" sideOffset={4}>
          <DMItems items={actions()} />
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}
