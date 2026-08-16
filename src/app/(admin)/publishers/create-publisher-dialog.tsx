"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const createPublisherSchema = z.object({
    businessName: z.string().min(2, "Enter the registered business name."),
    ownerEmail: z.string().email("Enter a valid email address."),
    businessType: z.enum(["individual", "company"]),
    note: z.string().max(200, "Keep the note under 200 characters.").optional(),
});

type CreatePublisherValues = z.infer<typeof createPublisherSchema>;

interface CreatePublisherDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** "Add publisher" modal per the Figma create wireframe. */
export function CreatePublisherDialog({ open, onOpenChange }: CreatePublisherDialogProps) {
    const form = useForm<CreatePublisherValues>({
        resolver: zodResolver(createPublisherSchema),
        defaultValues: {
            businessName: "",
            ownerEmail: "",
            businessType: "individual",
            note: "",
        },
    });

    const onSubmit = (values: CreatePublisherValues) => {
        toast.success(`Activation link sent to ${values.ownerEmail}`, {
            description: `${values.businessName} has been registered with the KYC checklist.`,
        });
        onOpenChange(false);
        form.reset();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Add publisher</DialogTitle>
                    <DialogDescription>
                        Register a publisher directly. They&apos;ll get an activation link +
                        KYC checklist by email.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-colors hover:bg-muted/50"
                            onClick={() =>
                                toast.info("Logo upload is wired to storage in production.")
                            }
                        >
                            <span className="flex size-10 items-center justify-center rounded-md bg-muted">
                                <ImagePlus className="size-4 text-muted-foreground" />
                            </span>
                            <span>
                                <span className="block text-sm font-medium text-foreground">
                                    Upload logo
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                    PNG or JPG, up to 2 MB
                                </span>
                            </span>
                        </button>

                        <FormField
                            control={form.control}
                            name="businessName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Business name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Sharma Hoardings" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="ownerEmail"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Owner email</FormLabel>
                                    <FormControl>
                                        <Input placeholder="owner@business.in" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="businessType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Business type</FormLabel>
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="individual">Individual</SelectItem>
                                            <SelectItem value="company">Company</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="note"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Note</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Optional note for the activation email"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit">Add publisher</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
