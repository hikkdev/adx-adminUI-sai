import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/format";

interface InitialsAvatarProps {
    name: string;
    size?: "sm" | "md" | "lg";
    className?: string;
}

const sizeClasses = {
    sm: "size-6 text-[10px]",
    md: "size-8 text-[11px]",
    lg: "size-12 text-sm",
};

/** Neutral initials chip, the wireframes use letter avatars throughout. */
export function InitialsAvatar({ name, size = "md", className }: InitialsAvatarProps) {
    return (
        <span
            aria-hidden
            className={cn(
                "flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground",
                sizeClasses[size],
                className
            )}
        >
            {getInitials(name)}
        </span>
    );
}
