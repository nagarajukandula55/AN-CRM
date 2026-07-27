export type BusinessContext = {
  userId: string;
  businessId: string;

  accessKeys: string[];

  modules: string[];

  config: {
    invoice: any;
    documents: any;
    financial: any;
    compliance: any;
  };
};
