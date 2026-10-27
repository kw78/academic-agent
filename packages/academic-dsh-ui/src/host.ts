import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { AcademicUiApi } from './api.js'
import { createAcademicUiApi } from './api.js'
import type {
  AcceptPlanRequest,
  AutomationJob,
  AutomationView,
  AvailabilityView,
  CommandReceipt,
  ConnectionIdRequest,
  ConnectionSecretRequest,
  ConnectionsView,
  CoursesView,
  CreateConnectionRequest,
  CreateCourseRequest,
  CreateSourceRequest,
  CreateTaskRequest,
  DashboardView,
  HostStatus,
  ItemCard,
  JobEnabledRequest,
  LockBlockRequest,
  NotificationReadRequest,
  PlanCandidate,
  PlanMutationResult,
  PlanView,
  SettingsView,
  SourceIdRequest,
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
} from './protocol.js'
import type { ConnectionView, SyncRunSummary } from '@academic/contracts'

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
  'sourceLogin',
  'sourceSetSecret',
  'setConnectionSecret',
  'verifyConnection',
  'disconnectConnection',
  'deleteConnectionCredential',
  'automation',
  'setJobEnabled',
  'updateSyncSchedule',
  'syncNow',
  'markNotificationRead',
  'markAllNotificationsRead',
  'settings',
  'updateReminderSettings',
  'addCourse',
  'archiveCourse',
  'createTask',
  'completeTask',
  'reopenTask',
  'changeTaskEstimate',
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

  async sourceLogin(request: unknown): Promise<UiResult<ConnectionView>> {
    return (await this.apiReady).sourceLogin(request as SourceIdRequest)
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

  async archiveCourse(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).archiveCourse(request)
  }

  async createTask(request: unknown): Promise<UiResult<CommandReceipt>> {
    return (await this.apiReady).createTask(request as CreateTaskRequest)
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
}

for (const method of REMOTE_METHODS) {
  markRemote(AcademicUiService.prototype, method)
}

export default AcademicUiService
