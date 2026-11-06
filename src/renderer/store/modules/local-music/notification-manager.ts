import { NotificationType } from '@/types';
import { translate, LanguageType } from '@/renderer/i18n';
import { currentLanguage } from './settings-manager';

interface NotificationState {
  notifications: NotificationType[]
}

const state: NotificationState = {
  notifications: []
};
let notificationSequence = 0;

const mutations = {
  pushNotification (state: NotificationState, payload: NotificationType) {
    // the main process sends the translation keys of the notifications
    const language = currentLanguage.value as LanguageType;
    const title = translate(language, payload.title);
    const subTitle = payload.subTitle
      ? translate(language, payload.subTitle, payload.values || {})
      : payload.subTitle;
    const groupKey = payload.groupKey || (payload.isPersistent ? `title:${title}` : '');
    const id = payload.id || groupKey || `notification-${Date.now()}-${notificationSequence += 1}`;
    const notification: NotificationType = {
      ...payload,
      id,
      groupKey,
      title,
      subTitle,
      isPersistent: payload.isPersistent || !!groupKey
    };

    // A group keeps the same card while its progress changes. Replacing the
    // object (instead of mutating one property) is what makes Vue 2 redraw
    // the subtitle and the progress bar.
    const targetNotificationIndex = state.notifications.findIndex((item) =>
      item.id === id ||
      (!!groupKey && item.groupKey === groupKey) ||
      (payload.isPersistent && item.title === title)
    );
    if (targetNotificationIndex === -1) {
      state.notifications.unshift(notification);
      return;
    }
    notification.id = state.notifications[targetNotificationIndex].id || notification.id;
    state.notifications.splice(targetNotificationIndex, 1, notification);
  },
  popNotification (state: NotificationState, payload?: string | NotificationType) {
    if (payload) {
      const key = typeof payload === 'string'
        ? payload
        : payload.id || payload.groupKey || payload.title;
      if (key) {
        const targetNotificationIndex = state.notifications.findIndex((notification) =>
          notification.id === key ||
          notification.groupKey === key ||
          notification.title === key
        );
        if (targetNotificationIndex !== -1) {
          state.notifications.splice(targetNotificationIndex, 1);
          return;
        }
      }
    }
    state.notifications.pop();
  },
  removeNotification (state: NotificationState, payload: string) {
    if (!payload) return;
    const targetNotificationIndex = state.notifications.findIndex((notification) =>
      notification.id === payload ||
      notification.groupKey === payload ||
      notification.title === payload
    );
    if (targetNotificationIndex !== -1) {
      state.notifications.splice(targetNotificationIndex, 1);
    }
  }
};

export default {
  state,
  mutations
};
