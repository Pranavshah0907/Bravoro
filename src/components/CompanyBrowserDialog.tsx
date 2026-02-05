import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, X, Copy, Phone } from "lucide-react";
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

        <ScrollArea className="flex-1 px-6 pb-6">
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
                  <CollapsibleContent className="pt-2 pl-7">
                    {renderContactsTable(company.contact_data)}
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
