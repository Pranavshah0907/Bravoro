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
  city: string;
  country: string;
  source: string;
  previewOnly: boolean;
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
  [key: string]: number;
}

export interface MessageMetadata {
  data?: StructuredData;
  credits?: Credits;
}
