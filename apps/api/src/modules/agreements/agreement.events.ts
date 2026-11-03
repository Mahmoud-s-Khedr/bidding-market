export interface AgreementDeliverableSubmittedEvent {
  agreementId: string;
  deliverableId: string;
  providerId: string;
}
export interface AgreementDeliverableAcceptedEvent {
  agreementId: string;
  deliverableId: string;
  buyerId: string;
}
export interface AgreementRevisionRequestedEvent {
  agreementId: string;
  deliverableId: string;
  buyerId: string;
}
export interface AgreementStatusEvent {
  agreementId: string;
  actorId: string;
}
export interface ReviewCreatedEvent {
  agreementId: string;
  reviewId: string;
  authorId: string;
  targetId: string;
}
