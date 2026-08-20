"use client";

import * as React from "react";
import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const DEPARTMENTS = [
    "Agents",
    "Design",
    "Development",
    "Finance",
    "HR",
    "Marketing",
    "QA",
    "Sales",
    "Support",
];

const EMPLOYMENT_TYPES = ["Full time", "Part time", "Contract", "Internship"];

/** Opens a new requisition from the Hiring tab. */
export function CreateHiringDialog() {
    const [open, setOpen] = React.useState(false);
    const [form, setForm] = React.useState({
        title: "",
        department: DEPARTMENTS[0],
        location: "",
        employmentType: EMPLOYMENT_TYPES[0],
        openings: "1",
        experience: "",
        hiringManager: "",
        description: "",
    });

    const set = <K extends keyof typeof form>(key: K, value: string) =>
        setForm((current) => ({ ...current, [key]: value }));

    const missing = !form.title.trim() || !form.location.trim() || !form.hiringManager.trim();

    const create = () => {
        if (missing) {
            toast.error("Add a title, location and hiring manager.");
            return;
        }
        toast.success(`${form.title} opened`, {
            description: `${form.openings} opening${form.openings === "1" ? "" : "s"} in ${form.department}`,
        });
        setOpen(false);
        setForm((current) => ({ ...current, title: "", location: "", description: "" }));
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                Create hiring
            </Button>

            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create hiring</DialogTitle>
                    <DialogDescription>
                        Open a requisition so candidates can be tracked against it.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-1">
                    <div className="grid gap-1.5">
                        <Label htmlFor="job-title">Role title</Label>
                        <Input
                            id="job-title"
                            value={form.title}
                            onChange={(event) => set("title", event.target.value)}
                            placeholder="e.g. Field Operations Executive"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="job-department">Department</Label>
                            <Select
                                value={form.department}
                                onValueChange={(value) => set("department", value)}
                            >
                                <SelectTrigger id="job-department">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DEPARTMENTS.map((department) => (
                                        <SelectItem key={department} value={department}>
                                            {department}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="job-type">Employment type</Label>
                            <Select
                                value={form.employmentType}
                                onValueChange={(value) => set("employmentType", value)}
                            >
                                <SelectTrigger id="job-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EMPLOYMENT_TYPES.map((type) => (
                                        <SelectItem key={type} value={type}>
                                            {type}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="job-location">Location</Label>
                            <Input
                                id="job-location"
                                value={form.location}
                                onChange={(event) => set("location", event.target.value)}
                                placeholder="e.g. Bengaluru"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="job-openings">Openings</Label>
                            <Input
                                id="job-openings"
                                type="number"
                                min="1"
                                value={form.openings}
                                onChange={(event) => set("openings", event.target.value)}
                                className="tabular-nums"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="job-experience">Experience</Label>
                            <Input
                                id="job-experience"
                                value={form.experience}
                                onChange={(event) => set("experience", event.target.value)}
                                placeholder="e.g. 2 to 4 years"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="job-manager">Hiring manager</Label>
                            <Input
                                id="job-manager"
                                value={form.hiringManager}
                                onChange={(event) => set("hiringManager", event.target.value)}
                                placeholder="e.g. Priya Rao"
                            />
                        </div>
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="job-description">Description</Label>
                        <Textarea
                            id="job-description"
                            rows={3}
                            value={form.description}
                            onChange={(event) => set("description", event.target.value)}
                            placeholder="What this person will own"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" className="bg-card" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={create}>Open requisition</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
