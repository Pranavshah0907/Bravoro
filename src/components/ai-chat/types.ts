export interface CompanyData {
  name: string;
  domain: string;
  city: string;
  country: string;
  industry: string;
  employees: string;
  website: string;
  linkedinUrl: string;
  jobs: JobData[];
  latestPost: string;
}

export interface JobData {
  title: string;
  url: string;
  postedAt: string;
}

export interface ContactData {
  fullName: string;
  jobTitle: string;
  companyName: string;
  companyDomain: string;
  linkedinUrl: string;
  email: string;
  phone: string;
  mobilePhone?: string;
  directPhone?: string;
  city: string;
  country: string;
  source: string;
  previewOnly: boolean;
  skills?: string[];
  experienceSummary?: string;
  headline?: string;
  seniority?: string;
  departments?: string;
  // Raw enrichment fields (preserved from n8n for DB persistence)
  personId?: string;
  firstName?: string;
  lastName?: string;
  apolloPersonID?: string;
  cognismPersonID?: string;
  peopleSearchBy?: string;
  apolloCreditsUsed?: number;
  cognismCreditsUsed?: number;
  lushaCreditsUsed?: number;
  aLeadscreditsUsed?: number;
}

export interface StructuredData {
  type: string;
  awaitingConfirmation: boolean;
  companies: CompanyData[];
  contacts: ContactData[];
  technographics: unknown;
}

export interface Credits {
  theirstack: number;
  cognism: number;
  apollo: number;
  lusha: number;
  aleads: number;
  total: number;
  brave_searches?: number;
  contacts_with_mobile_phone?: number;
  contacts_with_direct_phone_only?: number;
  email_linkedin_only_contacts?: number;
  mobile_phone_credits?: number;
  direct_phone_credits?: number;
  email_only_credits?: number;
  theirstack_total_credits?: number;
  [key: string]: number | undefined;
}

export interface MessageMetadata {
  data?: StructuredData;
  credits?: Credits;
  apiCost?: number;
}
