import type {
    AttendanceRecord,
    AttendanceStatus,
    Candidate,
    Department,
    Employee,
    EmployeeType,
    EmploymentStatus,
    Holiday,
    HrOverview,
    JobOpening,
    LeaveRequest,
    PayrollRow,
} from "@/types";

/* ------------------------------------------------------------------ */
/* Employees: 26 staff records ported from the ADX-AdminUI template   */
/* ------------------------------------------------------------------ */

type Seed = [
    id: string,
    name: string,
    code: string,
    department: string,
    designation: string,
    type: EmployeeType,
    employment: EmploymentStatus,
    dob: string,
    joined: string,
    location: string,
    region: string,
    mobile: string,
    gender: string,
    marital: string,
    address: string,
    workingDays: number,
];

const SEEDS: Seed[] = [
    ["emp_01", "Darlene Robertson", "345321231", "Design", "UI/UX Designer", "office", "permanent", "1995-04-12", "2022-03-15", "Main Office", "Delhi NCR", "9876543210", "Female", "Married", "45, Green Park, Delhi", 5],
    ["emp_02", "Floyd Miles", "987890345", "Development", "PHP Developer", "office", "part_time", "1992-08-22", "2021-11-01", "Main Office", "Maharashtra", "9876543211", "Male", "Single", "12, Sky Tower, Mumbai", 5],
    ["emp_03", "Cody Fisher", "453367122", "Sales", "Sales Manager", "office", "permanent", "1990-01-05", "2020-05-20", "Regional Office", "Maharashtra", "9876543212", "Male", "Married", "78, Blue Street, Pune", 6],
    ["emp_04", "Dianne Russell", "345321232", "Sales", "BDM", "remote", "part_time", "1994-11-30", "2023-02-14", "Remote", "Karnataka", "9876543213", "Female", "Single", "9, Lotus Colony, Bangalore", 5],
    ["emp_05", "Savannah Nguyen", "453677881", "Design", "Design Lead", "office", "permanent", "1988-03-18", "2019-09-10", "Main Office", "Tamil Nadu", "9876543214", "Female", "Married", "22, Silver Oaks, Chennai", 5],
    ["emp_06", "Jacob Jones", "009918765", "Development", "Python Developer", "remote", "permanent", "1996-12-04", "2023-06-01", "Remote", "Telangana", "9876543215", "Male", "Single", "101, Lake View, Hyderabad", 5],
    ["emp_07", "Marvin Bessie", "238870122", "Development", "Sr. UI Developer", "remote", "permanent", "1991-05-25", "2022-10-12", "Remote", "West Bengal", "9876543216", "Male", "Married", "56, Hill Road, Kolkata", 5],
    ["emp_08", "Brooklyn Simmons", "124335111", "PM", "Project Manager", "office", "permanent", "1989-07-14", "2021-01-20", "Main Office", "Delhi NCR", "9876543217", "Female", "Married", "33, Metro View, Gurgaon", 5],
    ["emp_09", "Kristin Watson", "435540099", "HR", "HR Executive", "office", "permanent", "1993-02-28", "2023-05-15", "Main Office", "Rajasthan", "9876543218", "Female", "Single", "88, Rose Garden, Jaipur", 5],
    ["emp_10", "Kathryn Purnell", "009812890", "Development", "React JS Developer", "office", "permanent", "1997-10-10", "2024-01-05", "Main Office", "Uttar Pradesh", "9876543219", "Female", "Single", "41, Tech Park, Noida", 5],
    ["emp_11", "Arlene McCoy", "671190345", "Development", "Node JS Developer", "office", "permanent", "1994-03-22", "2023-11-20", "Main Office", "Punjab", "9876543220", "Female", "Married", "77, Oak Street, Chandigarh", 5],
    ["emp_12", "Devon Lane", "091233412", "BA", "Business Analyst", "remote", "permanent", "1992-06-15", "2022-04-10", "Remote", "Uttar Pradesh", "9876543221", "Male", "Married", "15, Pearl Tower, Indore", 5],
    ["emp_13", "Guy Hawkins", "112233445", "QA", "Automation Engineer", "office", "permanent", "1995-12-12", "2023-08-01", "Main Office", "Karnataka", "9876543222", "Male", "Single", "10, QA Hub, Pune", 5],
    ["emp_14", "Jane Cooper", "223344556", "Finance", "Accountant", "office", "permanent", "1990-05-05", "2020-02-15", "Main Office", "Delhi NCR", "9876543223", "Female", "Married", "25, Money Road, Delhi", 5],
    ["emp_15", "Leslie Alexander", "334455667", "Marketing", "SEO Specialist", "remote", "permanent", "1993-09-09", "2022-07-20", "Remote", "Maharashtra", "9876543224", "Female", "Single", "44, Web Avenue, Mumbai", 5],
    ["emp_16", "Esther Howard", "445566778", "Support", "Support Lead", "office", "permanent", "1987-01-01", "2018-05-10", "Regional Office", "Karnataka", "9876543225", "Female", "Married", "12, Care Colony, Bangalore", 6],
    ["emp_17", "Cameron Williamson", "556677889", "Design", "Graphic Designer", "office", "contract", "1996-03-14", "2024-02-01", "Main Office", "Rajasthan", "9876543226", "Male", "Single", "99, Art Lane, Jaipur", 5],
    ["emp_18", "Ronald Richards", "667788990", "Development", "Java Developer", "remote", "part_time", "1991-11-11", "2021-12-15", "Remote", "Telangana", "9876543227", "Male", "Married", "55, Java Jive, Hyderabad", 5],
    ["emp_19", "Albert Flores", "778899001", "Security", "Security Analyst", "office", "permanent", "1985-04-04", "2017-03-20", "Main Office", "Delhi NCR", "9876543228", "Male", "Married", "1, Shield Street, Delhi", 5],
    ["emp_20", "Ralph Edwards", "889900112", "Legal", "Legal Consultant", "office", "contract", "1982-12-25", "2023-09-01", "Main Office", "Maharashtra", "9876543229", "Male", "Married", "100, Court Way, Mumbai", 5],
    ["emp_21", "Bessie Cooper", "990011223", "Marketing", "Content Writer", "remote", "part_time", "1998-05-15", "2024-04-10", "Remote", "West Bengal", "9876543230", "Female", "Single", "32, Pen Park, Kolkata", 5],
    ["emp_22", "Theresa Webb", "001122334", "Design", "Motion Designer", "office", "permanent", "1994-08-08", "2022-12-05", "Main Office", "Delhi NCR", "9876543231", "Female", "Married", "66, Motion Blvd, Gurgaon", 5],
    ["emp_23", "Courtney Henry", "112233446", "HR", "Recruiter", "office", "permanent", "1991-02-14", "2021-06-15", "Main Office", "Uttar Pradesh", "9876543232", "Female", "Married", "8, Talent Hub, Noida", 5],
    ["emp_24", "Eleanor Pena", "223344557", "BA", "Sr. Business Analyst", "office", "part_time", "1987-11-11", "2019-12-20", "Regional Office", "Uttar Pradesh", "9876543233", "Female", "Married", "14, Logic Lane, Indore", 6],
    ["emp_25", "Marvin McKinney", "334455668", "Sales", "Sales Executive", "remote", "contract", "1996-05-05", "2024-03-01", "Remote", "Uttar Pradesh", "9876543234", "Male", "Single", "5, Sale St, Pune", 5],
    ["emp_26", "Mel Doryn", "694455668", "Development", "Python Developer", "remote", "part_time", "2000-05-05", "2025-03-01", "Remote", "Uttar Pradesh", "9547893234", "Female", "Married", "5, Sale St, Lucknow", 5],
];

const slug = (name: string) => name.toLowerCase().split(" ")[0];

export const employees: Employee[] = SEEDS.map(
    ([id, name, code, department, designation, type, employment, dob, joined, location, region, mobile, gender, marital, address, workingDays]) => ({
        id,
        name,
        employeeCode: code,
        email: `${slug(name)}.${name.split(" ")[1]?.[0]?.toLowerCase() ?? "x"}@company.com`,
        officialEmail: `${slug(name)}@adx.in`,
        mobile,
        department,
        designation,
        type,
        employment,
        dob,
        joiningDate: joined,
        location,
        region,
        workingDays,
        gender,
        maritalStatus: marital,
        nationality: "Indian",
        address,
        documents: [
            { label: "Appointment letter", file: "appointment-letter.pdf", uploaded: joined },
            { label: "Salary slips", file: "salary-slips.pdf", uploaded: "2026-07-01" },
            { label: "Relieving letter", file: "relieving-letter.pdf", uploaded: "" },
            { label: "Experience letter", file: "experience-letter.pdf", uploaded: "" },
        ],
        accounts: [
            { label: "Slack", value: `${slug(name)}_${department.toLowerCase()}` },
            { label: "Skype", value: `live:${slug(name)}` },
            { label: "GitHub", value: `${slug(name)}-dev` },
        ],
    })
);

/* ---------------------------- Departments -------------------------- */

const DEPARTMENT_DESCRIPTIONS: Record<string, string> = {
    Design: "Owns the ADX brand, product design and creative review tooling.",
    Development: "Builds and operates the marketplace platform and agent app.",
    Sales: "Signs publishers and advertisers, owns revenue targets.",
    PM: "Coordinates roadmaps and delivery across departments.",
    HR: "Hiring, onboarding, payroll inputs and people operations.",
    BA: "Requirements, reporting and process analysis.",
    QA: "Release quality, regression coverage and load testing.",
    Finance: "Payouts, invoicing, reconciliation and compliance.",
    Marketing: "Campaigns, growth content and newsletters.",
    Support: "Advertiser and publisher support desk.",
    Security: "Platform security reviews and fraud tooling.",
    Legal: "Contracts, municipal permits and privacy compliance.",
};

export const departments: Department[] = Object.entries(DEPARTMENT_DESCRIPTIONS).map(
    ([name, description]) => {
        const members = employees.filter((e) => e.department === name);
        return {
            slug: name.toLowerCase(),
            name,
            head: members[0]?.name ?? "Unassigned",
            headcount: members.length,
            openRoles: name === "Development" ? 2 : name === "Design" || name === "Sales" ? 1 : 0,
            description,
        };
    }
);

/* ----------------------------- Attendance -------------------------- */

const att = (
    id: string,
    employeeId: string,
    date: string,
    checkIn: string,
    checkOut: string,
    status: AttendanceStatus
): AttendanceRecord => {
    const person = employees.find((e) => e.id === employeeId)!;
    const hours =
        checkIn === "-"
            ? "0h 00m"
            : status === "half_day"
              ? "4h 30m"
              : status === "late"
                ? "8h 45m"
                : "9h 00m";
    return {
        id,
        employee: person.name,
        designation: person.designation,
        department: person.department,
        date,
        checkIn,
        checkOut,
        workHours: hours,
        status,
    };
};

export const attendance: AttendanceRecord[] = [
    att("AT-001", "emp_01", "2026-08-10", "09:00 AM", "06:00 PM", "on_time"),
    att("AT-002", "emp_02", "2026-08-10", "09:30 AM", "06:30 PM", "late"),
    att("AT-003", "emp_03", "2026-08-10", "08:45 AM", "05:45 PM", "on_time"),
    att("AT-004", "emp_04", "2026-08-10", "10:00 AM", "07:00 PM", "late"),
    att("AT-005", "emp_05", "2026-08-10", "09:02 AM", "06:01 PM", "on_time"),
    att("AT-006", "emp_06", "2026-08-10", "09:05 AM", "06:05 PM", "wfh"),
    att("AT-007", "emp_07", "2026-08-10", "-", "-", "absent"),
    att("AT-008", "emp_08", "2026-08-10", "08:55 AM", "05:55 PM", "on_time"),
    att("AT-009", "emp_09", "2026-08-10", "09:15 AM", "01:30 PM", "half_day"),
    att("AT-010", "emp_10", "2026-08-10", "09:08 AM", "06:04 PM", "on_time"),
    att("AT-011", "emp_11", "2026-08-10", "09:01 AM", "06:00 PM", "on_time"),
    att("AT-012", "emp_12", "2026-08-10", "09:12 AM", "06:10 PM", "wfh"),
    att("AT-013", "emp_13", "2026-08-10", "09:45 AM", "06:45 PM", "late"),
    att("AT-014", "emp_14", "2026-08-10", "08:50 AM", "05:45 PM", "on_time"),
    att("AT-015", "emp_15", "2026-08-10", "09:20 AM", "06:20 PM", "wfh"),
    att("AT-016", "emp_16", "2026-08-10", "09:00 AM", "06:00 PM", "on_time"),
    att("AT-017", "emp_17", "2026-08-10", "-", "-", "absent"),
    att("AT-018", "emp_18", "2026-08-10", "09:10 AM", "06:15 PM", "wfh"),
    att("AT-019", "emp_19", "2026-08-10", "08:40 AM", "05:50 PM", "on_time"),
    att("AT-020", "emp_20", "2026-08-10", "09:25 AM", "06:20 PM", "late"),
    att("AT-021", "emp_21", "2026-08-09", "09:00 AM", "06:00 PM", "wfh"),
    att("AT-022", "emp_22", "2026-08-09", "09:03 AM", "06:02 PM", "on_time"),
    att("AT-023", "emp_23", "2026-08-09", "09:00 AM", "06:00 PM", "on_time"),
    att("AT-024", "emp_24", "2026-08-09", "09:35 AM", "06:30 PM", "late"),
    att("AT-025", "emp_25", "2026-08-09", "-", "-", "absent"),
    att("AT-026", "emp_26", "2026-08-09", "09:18 AM", "06:12 PM", "wfh"),
];

/* ------------------------------- Leave ----------------------------- */

export const leaveRequests: LeaveRequest[] = [
    { id: "LV-01", employee: "Darlene Robertson", department: "Design", leaveType: "Casual leave", from: "2026-08-13", to: "2026-08-13", days: 1, reason: "Personal errand", status: "approved", approver: "Kristin Watson" },
    { id: "LV-02", employee: "Floyd Miles", department: "Development", leaveType: "Sick leave", from: "2026-08-12", to: "2026-08-14", days: 3, reason: "Fever, doctor advised rest", status: "pending", approver: "Kristin Watson" },
    { id: "LV-03", employee: "Jacob Jones", department: "Development", leaveType: "Earned leave", from: "2026-08-17", to: "2026-08-20", days: 4, reason: "Family function in Hyderabad", status: "pending", approver: "Kristin Watson" },
    { id: "LV-04", employee: "Brooklyn Simmons", department: "PM", leaveType: "Casual leave", from: "2026-08-11", to: "2026-08-11", days: 1, reason: "School admission visit", status: "approved", approver: "Kristin Watson" },
    { id: "LV-05", employee: "Guy Hawkins", department: "QA", leaveType: "Earned leave", from: "2026-08-24", to: "2026-08-28", days: 5, reason: "Trip planned before release freeze", status: "rejected", approver: "Kristin Watson" },
    { id: "LV-06", employee: "Jane Cooper", department: "Finance", leaveType: "Casual leave", from: "2026-08-14", to: "2026-08-14", days: 1, reason: "Bank formalities", status: "approved", approver: "Kristin Watson" },
    { id: "LV-07", employee: "Cameron Williamson", department: "Design", leaveType: "Sick leave", from: "2026-08-10", to: "2026-08-11", days: 2, reason: "Migraine", status: "approved", approver: "Kristin Watson" },
    { id: "LV-08", employee: "Bessie Cooper", department: "Marketing", leaveType: "Earned leave", from: "2026-09-01", to: "2026-09-04", days: 4, reason: "Durga Puja travel to Kolkata", status: "pending", approver: "Courtney Henry" },
    { id: "LV-09", employee: "Ralph Edwards", department: "Legal", leaveType: "Casual leave", from: "2026-08-18", to: "2026-08-19", days: 2, reason: "Court hearing in personal matter", status: "pending", approver: "Courtney Henry" },
    { id: "LV-10", employee: "Eleanor Pena", department: "BA", leaveType: "Sick leave", from: "2026-08-05", to: "2026-08-06", days: 2, reason: "Viral infection", status: "approved", approver: "Kristin Watson" },
];

/* ------------------------------ Holidays --------------------------- */
/* 2026 gazetted holidays, ported verbatim from the template.          */

export const holidays: Holiday[] = [
    { date: "2026-01-14", day: "Wednesday", name: "Makar Sankranti / Pongal", kind: "public" },
    { date: "2026-01-26", day: "Monday", name: "Republic Day", kind: "public" },
    { date: "2026-03-03", day: "Tuesday", name: "Holi Start (Holika Dahan)", kind: "public" },
    { date: "2026-03-04", day: "Wednesday", name: "Holi End", kind: "public" },
    { date: "2026-03-21", day: "Saturday", name: "Id-ul-Fitr (Tentative)", kind: "public" },
    { date: "2026-03-26", day: "Thursday", name: "Ram Navami", kind: "optional" },
    { date: "2026-03-31", day: "Tuesday", name: "Mahavir Jayanti", kind: "optional" },
    { date: "2026-04-03", day: "Friday", name: "Good Friday", kind: "public" },
    { date: "2026-04-14", day: "Tuesday", name: "Ambedkar Jayanti", kind: "public" },
    { date: "2026-05-01", day: "Friday", name: "Buddha Purnima", kind: "optional" },
    { date: "2026-05-27", day: "Wednesday", name: "Id-ul-Zuha (Bakrid) (Tentative)", kind: "public" },
    { date: "2026-06-26", day: "Friday", name: "Muharram (Tentative)", kind: "optional" },
    { date: "2026-08-15", day: "Saturday", name: "Independence Day", kind: "public" },
    { date: "2026-08-26", day: "Wednesday", name: "Id-e-Milad (Tentative)", kind: "optional" },
    { date: "2026-09-04", day: "Friday", name: "Janmashtami", kind: "public" },
    { date: "2026-10-02", day: "Friday", name: "Mahatma Gandhi's Birthday", kind: "public" },
    { date: "2026-10-17", day: "Saturday", name: "Durga Puja Start (Maha Saptami)", kind: "optional" },
    { date: "2026-10-18", day: "Sunday", name: "Maha Ashtami", kind: "optional" },
    { date: "2026-10-19", day: "Monday", name: "Maha Navami", kind: "optional" },
    { date: "2026-10-20", day: "Tuesday", name: "Dussehra (Vijayadashami) End", kind: "public" },
    { date: "2026-11-06", day: "Friday", name: "Diwali Start (Dhanteras)", kind: "optional" },
    { date: "2026-11-07", day: "Saturday", name: "Choti Diwali", kind: "optional" },
    { date: "2026-11-08", day: "Sunday", name: "Diwali (Lakshmi Puja)", kind: "public" },
    { date: "2026-11-09", day: "Monday", name: "Govardhan Puja", kind: "optional" },
    { date: "2026-11-10", day: "Tuesday", name: "Bhai Dooj End", kind: "public" },
    { date: "2026-11-15", day: "Sunday", name: "Chhath Puja", kind: "optional" },
    { date: "2026-11-24", day: "Tuesday", name: "Guru Nanak's Birthday", kind: "public" },
    { date: "2026-12-25", day: "Friday", name: "Christmas Day", kind: "public" },
];

/* ------------------------------ Payroll ---------------------------- */
/* July 2026 run. CTC figures ported from the template payroll table.  */

const CTC: Record<string, number> = {
    emp_01: 78000, emp_02: 45000, emp_03: 60000, emp_04: 34000, emp_05: 40000,
    emp_06: 45000, emp_07: 55000, emp_08: 60000, emp_09: 25000, emp_10: 30000,
    emp_11: 78000, emp_12: 45000, emp_13: 52000, emp_14: 65000, emp_15: 38000,
    emp_16: 47000, emp_17: 90000, emp_18: 32000, emp_19: 58000, emp_20: 41000,
    emp_21: 72000, emp_22: 28000, emp_23: 50000, emp_24: 63000, emp_25: 36000,
    emp_26: 49000,
};

const DEDUCTIONS: Record<string, number> = {
    emp_03: 380, emp_04: 800, emp_09: 500, emp_10: 20, emp_16: 500,
    emp_18: 300, emp_23: 705, emp_24: 120, emp_26: 90,
};

const PAID = new Set(["emp_03", "emp_05", "emp_08", "emp_10", "emp_14", "emp_22", "emp_24", "emp_26"]);

export const payroll: PayrollRow[] = employees.map((person) => {
    const ctc = CTC[person.id];
    const deductions = DEDUCTIONS[person.id] ?? 0;
    const gross = Math.round(ctc * 0.92);
    return {
        id: `PAY-0726-${person.id.replace("emp_", "")}`,
        employee: person.name,
        designation: person.designation,
        department: person.department,
        ctc,
        gross,
        deductions,
        netPay: gross - deductions,
        payDate: PAID.has(person.id) ? "2026-07-31" : "",
        status: PAID.has(person.id) ? "paid" : person.id === "emp_20" ? "on_hold" : "pending",
    };
});

/* ------------------------------- Hiring ---------------------------- */

export const jobOpenings: JobOpening[] = [
    {
        id: "JOB-01",
        title: "Senior AI Engineer",
        department: "Development",
        location: "Mumbai",
        workType: "Full time, office",
        openings: 1,
        applicants: 34,
        postedOn: "2026-07-02",
        salaryBand: "Rs 28L to 36L",
        status: "open",
        tags: ["Python", "PyTorch", "LLMs", "MLOps"],
    },
    {
        id: "JOB-02",
        title: "Data Scientist",
        department: "BA",
        location: "Bangalore",
        workType: "Full time, remote",
        openings: 2,
        applicants: 51,
        postedOn: "2026-07-10",
        salaryBand: "Rs 18L to 24L",
        status: "open",
        tags: ["SQL", "Python", "Machine Learning", "Tableau"],
    },
    {
        id: "JOB-03",
        title: "Cloud Architect",
        department: "Development",
        location: "Remote",
        workType: "Contract, remote",
        openings: 1,
        applicants: 19,
        postedOn: "2026-06-18",
        salaryBand: "Rs 30L to 38L",
        status: "closed",
        tags: ["AWS", "Terraform", "Kubernetes", "Docker"],
    },
    {
        id: "JOB-04",
        title: "Cybersecurity Analyst",
        department: "Security",
        location: "Delhi NCR",
        workType: "Full time, office",
        openings: 1,
        applicants: 22,
        postedOn: "2026-07-15",
        salaryBand: "Rs 20L to 26L",
        status: "open",
        tags: ["Ethical Hacking", "SIEM", "Network Security"],
    },
    {
        id: "JOB-05",
        title: "Prompt Engineer",
        department: "Design",
        location: "Remote",
        workType: "Contract, remote",
        openings: 1,
        applicants: 40,
        postedOn: "2026-07-20",
        salaryBand: "Rs 22L to 28L",
        status: "on_hold",
        tags: ["NLP", "Generative AI", "Fine tuning"],
    },
    {
        id: "JOB-06",
        title: "Field Operations Executive",
        department: "Sales",
        location: "Pune",
        workType: "Full time, field",
        openings: 3,
        applicants: 27,
        postedOn: "2026-07-25",
        salaryBand: "Rs 6L to 9L",
        status: "open",
        tags: ["OOH", "Site surveys", "Vendor management"],
    },
];

export const candidates: Candidate[] = [
    { id: "CND-104", name: "Alex Rivera", role: "Senior AI Engineer", department: "Development", stage: "offer", appliedOn: "2026-07-15", email: "alex.rivera@techmail.com", mobile: "9811001100", experience: "7 yrs" },
    { id: "CND-215", name: "Sarah Jenkins", role: "Senior AI Engineer", department: "Development", stage: "interview", appliedOn: "2026-07-17", email: "s.jenkins@aimail.io", mobile: "9811001101", experience: "5 yrs" },
    { id: "CND-088", name: "Priya Sharma", role: "Data Scientist", department: "BA", stage: "interview", appliedOn: "2026-07-16", email: "p.sharma@analytics.in", mobile: "9876500011", experience: "4 yrs" },
    { id: "CND-302", name: "Kevin Zhang", role: "Data Scientist", department: "BA", stage: "rejected", appliedOn: "2026-07-18", email: "kzhang@datalabs.com", mobile: "9811001103", experience: "3 yrs" },
    { id: "CND-012", name: "Jordan Hayes", role: "Prompt Engineer", department: "Design", stage: "screening", appliedOn: "2026-07-20", email: "jordan.ai@freelance.com", mobile: "9811001104", experience: "4 yrs" },
    { id: "CND-450", name: "James Sterling", role: "Cloud Architect", department: "Development", stage: "hired", appliedOn: "2026-06-25", email: "j.sterling@cloudnet.uk", mobile: "9811001105", experience: "9 yrs" },
    { id: "CND-019", name: "Sarah Chen", role: "Cybersecurity Analyst", department: "Security", stage: "rejected", appliedOn: "2026-07-18", email: "schen.security@proton.me", mobile: "9811001106", experience: "6 yrs" },
    { id: "CND-056", name: "Michael Scott", role: "Senior AI Engineer", department: "Development", stage: "screening", appliedOn: "2026-07-21", email: "m.scott@dunder.com", mobile: "9811001107", experience: "8 yrs" },
    { id: "CND-115", name: "Anita Desai", role: "Data Scientist", department: "BA", stage: "offer", appliedOn: "2026-07-22", email: "a.desai@dataworld.in", mobile: "9222233333", experience: "5 yrs" },
    { id: "CND-505", name: "Arjun Mehta", role: "Field Operations Executive", department: "Sales", stage: "screening", appliedOn: "2026-07-24", email: "arjun.networks@mumbai.in", mobile: "9999900000", experience: "2 yrs" },
    { id: "CND-641", name: "Rohan Gupta", role: "Field Operations Executive", department: "Sales", stage: "applied", appliedOn: "2026-08-01", email: "rohan.hr@consultancy.in", mobile: "9111122222", experience: "1 yr" },
    { id: "CND-702", name: "Fatima Al-Sayed", role: "Cybersecurity Analyst", department: "Security", stage: "interview", appliedOn: "2026-07-23", email: "fatima.sales@corp.ae", mobile: "9811001110", experience: "5 yrs" },
];

/* ------------------------------ Overview --------------------------- */

export const hrOverview: HrOverview = {
    attendanceSplit: [
        { label: "In office", value: 12 },
        { label: "Work from home", value: 6 },
        { label: "On leave", value: 3 },
        { label: "Absent", value: 3 },
    ],
    performanceTrend: [
        { label: "Jan", low: 30, medium: 50, high: 20 },
        { label: "Feb", low: 35, medium: 45, high: 20 },
        { label: "Mar", low: 40, medium: 40, high: 20 },
        { label: "Apr", low: 25, medium: 55, high: 20 },
        { label: "May", low: 30, medium: 50, high: 20 },
        { label: "Jun", low: 20, medium: 60, high: 20 },
    ],
};
