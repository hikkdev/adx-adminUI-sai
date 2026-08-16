"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

export interface ComboboxItem {
  label: string
  value: string
}

interface BaseComboboxProps {
  items: ComboboxItem[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
}

interface SingleComboboxProps extends BaseComboboxProps {
  multiple?: false
  value: string
  onValueChange: (value: string) => void
}

interface MultiComboboxProps extends BaseComboboxProps {
  multiple: true
  value: string[]
  onValueChange: (value: string[]) => void
}

type ComboboxProps = SingleComboboxProps | MultiComboboxProps

export function Combobox(props: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const {
    items,
    placeholder = "Select an option",
    searchPlaceholder = "Search...",
    emptyText = "No results found.",
    className,
  } = props

  if (props.multiple) {
    const { value, onValueChange } = props
    return (
      <div className="space-y-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn("w-full justify-between", className)}
            >
              {value.length === 0
                ? placeholder
                : `${value.length} selected`}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder={searchPlaceholder} />
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup className="max-h-64 overflow-auto">
                {items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    onSelect={() => {
                      const newValue = value.includes(item.value)
                        ? value.filter((v) => v !== item.value)
                        : [...value, item.value]
                      onValueChange(newValue)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(item.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
        <div className="flex flex-wrap gap-2">
          {value.map((itemValue) => {
            const item = items.find((i) => i.value === itemValue)
            if (!item) return null
            return (
              <Badge
                key={itemValue}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => {
                  onValueChange(value.filter((v) => v !== itemValue))
                }}
              >
                {item.label}
                <button
                  className="ml-1 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onValueChange(value.filter((v) => v !== itemValue))
                  }}
                >
                  ×
                </button>
              </Badge>
            )
          })}
        </div>
      </div>
    )
  }

  const { value, onValueChange } = props
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {value
            ? items.find((item) => item.value === value)?.label
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {items.map((item) => (
              <CommandItem
                key={item.value}
                value={item.value}
                onSelect={(currentValue) => {
                  onValueChange(currentValue === value ? "" : currentValue)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === item.value ? "opacity-100" : "opacity-0"
                  )}
                />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
