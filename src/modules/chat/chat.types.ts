export type ChatSender = {
  id: number;
  username: string;
  fullName: string | null;
  avatar: string | null;
};

export type ChatMessagePayload = {
  id: number;
  conversationId: number;
  contractId: number | null;
  content: string;
  type: string;
  taskId: number | null;
  senderId: number;
  sender: ChatSender;
  createdAt: string;
};

export type ContractTaskPayload = {
  id: number;
  contractId: number;
  createdById: number;
  title: string;
  description: string | null;
  status: string;
  createdBy: ChatSender;
  createdAt: string;
  updatedAt: string;
};

export type SharedContractSummary = {
  id: number;
  jobId: number;
  jobTitle: string;
  status: string;
};

export type ChatThreadSummary = {
  conversationId: number;
  counterpartyId: number;
  counterparty: ChatSender;
  lastMessage: ChatMessagePayload | null;
  unreadHint: number;
  openTasks: number;
};

export type ChatRoomPayload = {
  conversationId: number;
  counterparty: ChatSender;
  sharedContracts: SharedContractSummary[];
  defaultContractId: number | null;
  messages: ChatMessagePayload[];
};

export type ContractTaskWithProject = ContractTaskPayload & {
  jobId: number;
  jobTitle: string;
  counterpartyId: number;
};
