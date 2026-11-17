import type { ReactElement, ReactNode } from "react";
import { Dialog, DropdownMenu, Select, Tooltip } from "radix-ui";
import { Checkmark, ChevronDown } from "../icons";

/**
 * Shared controls built on Radix primitives, which bring the keyboard and focus behaviour:
 * focus stays inside an open dialog and returns to what opened it, menus move with the arrow
 * keys and close with Esc, tooltips also show on keyboard focus.
 */

/** Wrap the app once so tooltips share one delay. */
export function TipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={500} skipDelayDuration={300}>{children}</Tooltip.Provider>;
}

/** A tooltip on a button. Use it for icon-only buttons, with the same text as their `aria-label`. */
export function Tip({ text, side = "bottom", children }: { text: string; side?: "top" | "bottom" | "left" | "right"; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tip" side={side} sideOffset={6} collisionPadding={6}>
          {text}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** A dialog over the window. Esc or a click outside closes it. */
export function Modal({ title, children, onClose, className }: { title: string; children: ReactNode; onClose(): void; className?: string }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="backdrop">
          <Dialog.Content className={`modal${className ? ` ${className}` : ""}`} aria-describedby={undefined}>
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface Option {
  value: string;
  label: string;
  /** Options with the same group sit under one heading. */
  group?: string;
}

interface DropdownProps {
  value: string;
  options: Option[];
  onChange(value: string): void;
  label: string;
  /** No border, heading type: for a picker that reads as a title. */
  plain?: boolean;
  disabled?: boolean;
}

/** Radix Select can't hold an empty value, which the app uses for "none". */
const NONE = "__none__";

/** A themed drop-down, in place of the browser's own. */
export function Dropdown({ value, options, onChange, label, plain, disabled }: DropdownProps) {
  const groups = [...new Set(options.map((o) => o.group))];
  const item = (o: Option) => (
    <Select.Item key={o.value} value={o.value || NONE} className="menu-item">
      <Select.ItemText>{o.label}</Select.ItemText>
    </Select.Item>
  );
  return (
    <Select.Root value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <Select.Trigger className={`select-trigger${plain ? " plain" : ""}`} aria-label={label}>
        <Select.Value />
        <Select.Icon asChild>
          <ChevronDown size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="menu" position="popper" sideOffset={4} collisionPadding={6}>
          <Select.Viewport>
            {groups.map((g) =>
              g === undefined ? (
                options.filter((o) => o.group === undefined).map(item)
              ) : (
                <Select.Group key={g}>
                  <Select.Label className="menu-label">{g}</Select.Label>
                  {options.filter((o) => o.group === g).map(item)}
                </Select.Group>
              ),
            )}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Shown ticked. */
  checked?: boolean;
  /** A line above this item. */
  separated?: boolean;
  onSelect(): void;
}

/** A menu that opens from `trigger`, a single button. */
export function Menu({ trigger, items, align = "start" }: { trigger: ReactElement; items: MenuItem[]; align?: "start" | "end" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu"
          align={align}
          sideOffset={4}
          collisionPadding={6}
          // A menu hands focus back to its button when it closes; if the item opened a dialog,
          // focus must stay in the dialog instead.
          onCloseAutoFocus={(e) => document.querySelector('[role="dialog"]') && e.preventDefault()}
        >
          {items.map((it) => (
            <div key={it.label}>
              {it.separated && <DropdownMenu.Separator className="menu-sep" />}
              <DropdownMenu.Item
                className={`menu-item${it.danger ? " danger-item" : ""}`}
                disabled={it.disabled}
                onSelect={it.onSelect}
              >
                {it.icon}
                {it.label}
                {it.checked && <Checkmark size={14} style={{ marginLeft: "auto" }} />}
              </DropdownMenu.Item>
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
