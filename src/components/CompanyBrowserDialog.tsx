import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, X, Copy, Phone, Briefcase, ExternalLink, MapPin, Calendar as CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

interface JobResult {
  job_title: string;
  job_link?: string;
  location?: string;
  last_posted_date?: string;
  hiring_team_name?: string;
  hiring_team_linkedin?: string;
  hiring_team_role?: string;
  recruiter_phone_number?: string;
}

interface Contact {
  Record_ID?: string;
  First_Name: string;
  Last_Name: string;
  Domain: string;
  Organization: string;
  Title: string;
  Email: string;
  LinkedIn: string;
  Phone_Number_1: string;
  Phone_Number_2: string;
  job_search_result?: {
    job_search_status?: string;
    results?: Array<{ jobs?: JobResult[] } | JobResult>;
  };
}

interface CompanyResult {
  company_name: string;
  domain: string | null;
  contact_data: Contact[];
  result_type?: string;
}

interface CompanyBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: CompanyResult[];
  onSelectCompany: (companyName: string) => void;
}

const getPhoneNumbers = (contact: Partial<Contact>): string[] => {
  const raw = [contact.Phone_Number_1, contact.Phone_Number_2]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(raw));
};

export const CompanyBrowserDialog = ({
  open,
  onOpenChange,
  companies,
  onSelectCompany,
}: CompanyBrowserDialogProps) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const query = searchQuery.toLowerCase();
    return companies.filter((c) =>
      c.company_name.toLowerCase().includes(query)
    );
  }, [companies, searchQuery]);

  const toggleCompany = (companyName: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(companyName)) {
        next.delete(companyName);
      } else {
        next.add(companyName);
      }
      return next;
    });
  };

  const handleCopyPhone = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: "Copied",
        description: "Phone number copied to clipboard",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Couldn't copy the phone number",
        variant: "destructive",
      });
    }
  };

  const PhoneCell = ({ contact }: { contact: Contact }) => {
    const phones = useMemo(() => getPhoneNumbers(contact), [contact]);

    if (phones.length === 0) {
      return <span className="text-muted-foreground">-</span>;
    }

    if (phones.length === 1) {
      return <span className="text-muted-foreground">{phones[0]}</span>;
    }

    return (
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">{phones[0]}</span>
        <span className="text-muted-foreground">,</span>
        <Dialog>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            +{phones.length - 1}
          </Button>
        </Dialog>
      </div>
    );
  };

  const CompactJobsPanel = ({ contacts }: { contacts: Contact[] }) => {
    const uniqueJobs = useMemo<JobResult[]>(() => {
      const seen = new Set<string>();
      const jobs: JobResult[] = [];
      for (const c of contacts) {
        if (c.job_search_result?.job_search_status === "jobs_found" && Array.isArray(c.job_search_result.results)) {
          for (const resultGroup of c.job_search_result.results) {
            const jobList: JobResult[] = Array.isArray((resultGroup as any).jobs)
              ? (resultGroup as any).jobs
              : [resultGroup as JobResult];
            for (const job of jobList) {
              const key = job.job_link || job.job_title;
              if (key && !seen.has(key)) { seen.add(key); jobs.push(job); }
            }
          }
        }
      }
      return jobs;
    }, [contacts]);

    if (uniqueJobs.length === 0) return null;

    return (
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-3 py-2 mb-2 rounded-lg border border-border bg-muted/40 text-left hover:bg-muted/60 transition-colors">
            <div className="flex items-center gap-2">
              <Briefcase className="h-3.5 w-3.5 text-primary/70" />
              <span className="text-[11px] font-semibold tracking-widest uppercase text-primary/80">Job Openings</span>
              <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">{uniqueJobs.length}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            {uniqueJobs.map((job, idx) => (
              <div key={idx} className="rounded-md border border-border bg-card p-2.5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 flex-1">{job.job_title}</p>
                  {job.job_link && (
                    <a href={job.job_link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary/50 hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/60">
                  {job.location && <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{job.location}</span>}
                  {job.last_posted_date && <span className="flex items-center gap-1"><CalendarIcon className="h-2.5 w-2.5" />{job.last_posted_date}</span>}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderContactsTable = (contacts: Contact[]) => {
    if (contacts.length === 0) {
      return <p className="text-sm text-muted-foreground py-2">No contacts available.</p>;
    }

    return (
      <div className="overflow-x-auto rounded-lg border border-border/40 bg-card/80">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs font-semibold text-foreground">Name</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Title</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Email</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">Phone</TableHead>
              <TableHead className="text-xs font-semibold text-foreground">LinkedIn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact, idx) => (
              <TableRow key={idx} className="hover:bg-muted/10 transition-colors">
                <TableCell className="text-sm font-medium">
                  {contact.First_Name} {contact.Last_Name}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{contact.Title || "-"}</TableCell>
                <TableCell className="text-sm">
                  {contact.Email ? (
                    <a
                      href={`mailto:${contact.Email}`}
                      className="text-primary hover:text-secondary transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {contact.Email}
                    </a>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  <PhoneCell contact={contact} />
                </TableCell>
                <TableCell className="text-sm">
                  {contact.LinkedIn ? (
                    <a
                      href={contact.LinkedIn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-secondary transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </a>
                  ) : (
                    "-"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              All Companies ({companies.length})
            </DialogTitle>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by company name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          <div className="space-y-2 pt-2">
            {filteredCompanies.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No companies found matching "{searchQuery}"
              </p>
            ) : (
              filteredCompanies.map((company) => (
                <Collapsible
                  key={company.company_name}
                  open={expandedCompanies.has(company.company_name)}
                  onOpenChange={() => toggleCompany(company.company_name)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border border-border/30">
                      <div className="flex items-center gap-3">
                        {expandedCompanies.has(company.company_name) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium text-sm text-foreground">
                          {company.company_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({company.contact_data.length} contacts)
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-primary hover:text-primary/80"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCompany(company.company_name);
                          onOpenChange(false);
                        }}
                      >
                        View in Results
                      </Button>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <CompactJobsPanel contacts={company.contact_data} />
                    {renderContactsTable(company.contact_data)}
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
