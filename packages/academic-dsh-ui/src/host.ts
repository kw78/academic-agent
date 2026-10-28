import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { AcademicUiApi } from './api.js'
import { createAcademicUiApi } from './api.js'
import type {
  AcceptPlanRequest,
  AdapterCandidateActivationView,
  AdapterCandidateRegistrationView,
  AdapterCandidateSummary,
  AdapterCandidateValidationView,
  AdapterCandidatesView,
  AutomationJob,
  AutomationView,
  AvailabilityView,
  CommandReceipt,
  ConnectionIdRequest,
  ConnectionSecretRequest,
  ConnectionsView,
  CourseMergeView,
  CoursesView,
  CreateConnectionRequest,
  CreateCourseRequest,
  CreateSourceRequest,
  CreateTaskRequest,
  DashboardView,
  DeleteMaterialRequest,
  HostStatus,
  ImportMaterialAttachmentsRequest,
  ImportMaterialFileRequest,
  ImportMaterialTextRequest,
  ImportMaterialUrlRequest,
  ItemCard,
  JobEnabledRequest,
  LockBlockRequest,
  MaterialAttachmentsView,
  MaterialImportView,
  MaterialRebuildView,
  MaterialSearchRequest,
  MaterialSearchView,
  MaterialsView,
  MaterialSubscriptionRequest,
  MaterialSubscriptionView,
  NotificationReadRequest,
  PlanCandidate,
  PlanMutationResult,
  PlanView,
  SettingsView,
  SourceIdRequest,
  SourceProbeEvidence,
  SourceSecretRequest,
  SourceStatus,
  SyncNowRequest,
  TasksView,
  UiResult,
  UnlockBlockRequest,
  UpdateAvailabilityRequest,
  UpdateReminderSettingsRequest,
  UpdateSourceRequest,
  UpdateSyncScheduleRequest,
  WebFetchRequest,
  WebLoginRequest,
  WebSessionFetchView,
  WebSessionIdRequest,
  WebSessionView,
} from './protocol.js'
import type { ConnectionView, SyncPreview, SyncRunSummary } from '@academic/contracts'

const REMOTE_METHODS = [
  'status',
  'dashboard',
  'courses',
  'items',
  'tasks',
  'plan',
  'previewPlan',
  'acceptPlan',
  'lockPlanBlock',
  'unlockPlanBlock',
  'archivePlan',
  'availability',
  'updateAvailability',
  'connections',
  'createConnection',
  'createSource',
  'updateSource',
  'archiveSource',
  'restoreSource',
  'deleteSource',
  'sourceLogin',
  'probeSource',
  'adapterCandidates',
  'validateAdapterCandidate',
  'registerAdapterCandidate',
  'activateAdapterCandidate',
  'rollbackAdapterCandidate',
  'sourceSetSecret',
  'setConnectionSecret',
  'webSessions',
  'webLogin',
  'webFetch',
  'webDelete',
  'verifyConnection',
  'disconnectConnection',
  'deleteConnectionCredential',
  'automation',
  'setJobEnabled',
  'updateSyncSchedule',
  'syncNow',
  'previewSourceSync',
  'markNotificationRead',
  'markAllNotificationsRead',
  'settings',
  'updateReminderSettings',
  'addCourse',
  'updateCourse',
  'archiveCourse',
  'restoreCourse',
  'deleteCourse',
  'archiveItem',
  'restoreItem',
  'createTask',
  'updateTask',
  'archiveTask',
  'restoreTask',
  'completeTask',
  'reopenTask',
  'changeTaskEstimate',
  'mergeDuplicateCourses',
  'materials',
  'materialSearch',
  'importMaterialText',
  'importMaterialFile',
  'importMaterialUrl',
  'deleteMaterial',
  'rebuildMaterials',
  'importMaterialAttachments',
  'setMaterialSubscription',
] as const

/**
 * esbuild cannot lower standard decorators, so the public Remote decorator is
 * applied with a minimal synthetic context. The decorator only needs the
 * method name and an initializer that marks the owning prototype.
 */
function markRemote(prototype: object, name: string): void {
  const method = (prototype as Record<string, unknown>)[name]
  if (typeof method !== 'function') {
    throw new Error(`Cannot mark missing Remote method: ${name}`)
  }
  Remote(method, {
    kind: 'method',
    name,
    private: false,
    static: false,
    addInitializer(initializer: (this: unknown) => void) {
      initializer.call(Object.create(prototype))
    },
  })
}

/**
 * Host-side adapter between the DSH Remote gateway and the Academic App.
 * This service owns no domain rules and no credentials: every read goes
 * through Query API, every business write through the Command API.
 */
export class AcademicUiService extends TypertRemoteService {
  static inject = ['academicApp']

  readonly apiReady: Promise<AcademicUiApi>

  constructor(ctx: Context) {
    super(ctx, 'academicUi', { namespace: 'academic' })
    this.apiReady = ctx.academicApp.appReady.then((app) => createAcademicUiApi(app))
  }

  async status(request: unknown): Promise<UiResult<HostStatus>> {
    return (await this.apiReady).status(request)
  }

  async dashboard(request: unknown): Promise<UiResult<DashboardView>> {
    return (await this.apiReady).dashboard(request)
  }

  async courses(request: unknown): Promise<UiResult<CoursesView>> {
    return (await this.apiReady).courses(request)
  }

  async items(
    request: unknown,
  ): Promise<UiResult<{ items: ItemCard[]; nextCursor?: string }>> {
    return (await this.apiReady).items(request)
  }

  async tasks(request: unknown): Promise<UiResult<TasksView>> {
    return (await this.apiReady).tasks(request)
  }

  async plan(request: unknown): Promise<UiResult<PlanView>> {
    return (await this.apiReady).plan(request)
  }

  async previewPlan(request: unknown): Promise<UiResult<PlanCandidate>> {
    return (await this.apiReady).previewPlan(request)
  }

  async acceptPlan(request: unknown): Promise<UiResult<PlanMutationResult>> {
    return (await this.apiReady).acceptPlan(request as AcceptPlanRequest)
  }

  async lockPlanBlock(request: unknown): Promise<UiResult<PlanMutationResult>> {
    return (await this.apiReady).lockPlanBlock(request as LockBlockRequest)
  }

  async unlockPlanBlock(
    request: unknown,
  ): Promise<UiResult<PlanMutationResult>> {
    return (await this.apiReady).unlockPlanBlock(request as UnlockBlockRequest)
  }

  async archivePlan(request: unknown): Promise<UiResult<PlanMutationResult>> {
    return (await this.apiReady).archivePlan(request)
  }

  async availability(request: unknown): Promise<UiResult<AvailabilityView>> {
    return (await this.apiReady).availability(request)
  }

  async updateAvailability(
    request: unknown,
  ): Promise<UiResult<AvailabilityView>> {
    return (await this.apiReady).updateAvailability(request as UpdateAvailabilityRequest)
  }

  async connections(request: unknown): Promise<UiResult<ConnectionsView>> {
    return (await this.apiReady).connections(request)
  }

  async createConnection(
    request: unknown,
  ): Promise<UiResult<ConnectionView>> {
    return (await this.apiReady).createConnection(request as CreateConnectionRequest)
  }

  async createSource(request: unknown): Promise<UiResult<SourceStatus>> {
    return (await this.apiReady).createSource(request as CreateSourceRequest)
  }

  async updateSource(request: unknown): Promise<UiResult<SourceStatus>> {
    return (await this.apiReady).updateSource(request as UpdateSourceRequest)
  }

  async archiveSource(request: unknown): Promise<UiResult<SourceStatus>> {
    return (await this.apiReady).archiveSource(request as SourceIdRequest)
  }

  async restoreSource(request: unknown): Promise<UiResult<SourceStatus>> {
    return (await this.apiReady).restoreSource(request as SourceIdRequest)
  }

  async deleteSource(
    request: unknown,
  ): Promise<UiResult<{ deleted: boolean }>> {
    return (await this.apiReady).deleteSource(request as SourceIdRequest)
  }

  async sourceLogin(request: unknown): Promise<UiResult<ConnectionView>> {
    return (await this.apiReady).sourceLogin(request as SourceIdRequest)
  }

  async probeSource(request: unknown): Promise<UiResult<SourceProbeEvidence>> {
    return (await this.apiReady).probeSource(request)
  }

  async adapterCandidates(request: unknown): Promise<UiResult<AdapterCandidatesView>> {
    return (await this.apiReady).adapterCandidates(request)
  }

  async validateAdapterCandidate(
    request: unknown,
  ): Promise<UiResult<AdapterCandidateValidationView>> {
    return (await this.apiReady).validateAdapterCandidate(request)
  }

  async registerAdapterCandidate(
    request: unknown,
  ): Promise<UiResult<AdapterCandidateRegistrationView>> {
    return (await this.apiReady).registerAdapterCandidate(request)
  }

  async activateAdapterCandidate(
    request: unknown,
  ): Promise<UiResult<AdapterCandidateActivationView>> {
    return (await this.apiReady).activateAdapterCandidate(request)
  }

  async rollbackAdapterCandidate(
    request: unknown,
  ): Promise<UiResult<AdapterCandidateSummary>> {
    return (await this.apiReady).rollbackAdapterCandidate(request)
  }

  async sourceSetSecret(
    request: unknown,
  ): Promise<UiResult<ConnectionView>> {
    return (await this.apiReady).sourceSetSecret(request as SourceSecretRequest)
  }

  async setConnectionSecret(
    request: unknown,
  ): Promise<UiResult<ConnectionView>> {
    return (await this.apiReady).setConnectionSecret(request as ConnectionSecretRequest)
  }

  async verifyConnection(
    request: unknown,
  ): Promise<UiResult<ConnectionView>> {
    return (await this.apiReady).verifyConnection(request as ConnectionIdRequest)
  }

  async disconnectConnection(
    request: unknown,
  ): Promise<UiResult<ConnectionView>> {
    return (await this.apiReady).disconnectConnection(request as ConnectionIdRequest)
  }

  async deleteConnectionCredential(
    request: unknown,
  ): Promise<UiResult<ConnectionView>> {
    return (await this.apiReady).deleteConnectionCredential(
      request as ConnectionIdRequest,
    )
  }

  async webSessions(
    request: unknown,
  ): Promise<UiResult<{ sessions: WebSessionView[] }>> {
    return (await this.apiReady).webSessions(request)
  }

  async webLogin(request: unknown): Promise<UiResult<WebSessionView>> {
    return (await this.apiReady).webLogin(request as WebLoginRequest)
  }

  async webFetch(request: unknown): Promise<UiResult<WebSessionFetchView>> {
    return (await this.apiReady).webFetch(request as WebFetchRequest)
  }

  async webDelete(
    request: unknown,
  ): Promise<UiResult<{ deleted: boolean }>> {
    return (await this.apiReady).webDelete(request as WebSessionIdRequest)
  }

  async automation(request: unknown): Promise<UiResult<AutomationView>> {
    return (await this.apiReady).automation(request)
  }

  async setJobEnabled(request: unknown): Promise<UiResult<AutomationJob>> {
    return (await this.apiReady).setJobEnabled(request as JobEnabledRequest)
  }

  async updateSyncSchedule(
    request: unknown,
  ): Promise<UiResult<AutomationJob>> {
    return (await this.apiReady).updateSyncSchedule(
      request as UpdateSyncScheduleRequest,
    )
  }

  async syncNow(request: unknown): Promise<UiResult<SyncRunSummary>> {
    return (await this.apiReady).syncNow(request as SyncNowRequest)
  }

  async previewSourceSync(request: unknown): Promise<UiResult<SyncPreview>> {
    return (await this.apiReady).previewSourceSync(request)
  }

  async markNotificationRead(
    request: unknown,
  ): Promise<UiResult<{ changed: boolean }>> {
    return (await this.apiReady).markNotificationRead(
      request as NotificationReadRequest,
    )
  }

  async markAllNotificationsRead(
    request: unknown,
  ): Promise<UiResult<{ changed: number }>> {
    return (await this.apiReady).markAllNotificationsRead(request)
  }

  async settings(request: unknown): Promise<UiResult<SettingsView>> {
    return (await this.apiReady).settings(request)
  }

  async updateReminderSettings(
    request: unknown,
  ): Promise<
    UiResult<{ enabled: boolean; thresholdsHours: number[]; updatedAt: string }>
  > {
    return (await this.apiReady).updateReminderSettings(
      request as UpdateReminderSettingsRequest,
    )
  }

  async addCourse(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).addCourse(request as CreateCourseRequest)
  }

  async updateCourse(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).updateCourse(request)
  }

  async archiveCourse(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).archiveCourse(request)
  }

  async restoreCourse(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).restoreCourse(request)
  }

  async deleteCourse(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).deleteCourse(request)
  }

  async archiveItem(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).archiveItem(request)
  }

  async restoreItem(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).restoreItem(request)
  }

  async createTask(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).createTask(request as CreateTaskRequest)
  }

  async updateTask(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).updateTask(request)
  }

  async archiveTask(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).archiveTask(request)
  }

  async restoreTask(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).restoreTask(request)
  }

  async completeTask(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).completeTask(request)
  }

  async reopenTask(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).reopenTask(request)
  }

  async changeTaskEstimate(
    request: unknown,
  ): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).changeTaskEstimate(request)
  }

  async mergeDuplicateCourses(
    request: unknown,
  ): Promise<UiResult<CourseMergeView>> {
    return (await this.apiReady).mergeDuplicateCourses(request)
  }

  async materials(request: unknown): Promise<UiResult<MaterialsView>> {
    return (await this.apiReady).materials(request)
  }

  async materialSearch(request: unknown): Promise<UiResult<MaterialSearchView>> {
    return (await this.apiReady).materialSearch(request as MaterialSearchRequest)
  }

  async importMaterialText(request: unknown): Promise<UiResult<MaterialImportView>> {
    return (await this.apiReady).importMaterialText(
      request as ImportMaterialTextRequest,
    )
  }

  async importMaterialFile(request: unknown): Promise<UiResult<MaterialImportView>> {
    return (await this.apiReady).importMaterialFile(
      request as ImportMaterialFileRequest,
    )
  }

  async importMaterialUrl(request: unknown): Promise<UiResult<MaterialImportView>> {
    return (await this.apiReady).importMaterialUrl(request as ImportMaterialUrlRequest)
  }

  async deleteMaterial(request: unknown): Promise<UiResult<{ deleted: boolean }>> {
    return (await this.apiReady).deleteMaterial(request as DeleteMaterialRequest)
  }

  async rebuildMaterials(request: unknown): Promise<UiResult<MaterialRebuildView>> {
    return (await this.apiReady).rebuildMaterials(request)
  }

  async importMaterialAttachments(
    request: unknown,
  ): Promise<UiResult<MaterialAttachmentsView>> {
    return (await this.apiReady).importMaterialAttachments(
      request as ImportMaterialAttachmentsRequest,
    )
  }

  async setMaterialSubscription(
    request: unknown,
  ): Promise<UiResult<MaterialSubscriptionView>> {
    return (await this.apiReady).setMaterialSubscription(
      request as MaterialSubscriptionRequest,
    )
  }
}

for (const method of REMOTE_METHODS) {
  markRemote(AcademicUiService.prototype, method)
}

export default AcademicUiService
