import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import ImageUploadStatus from '../ImageUploadStatus.vue'
import { i18n } from '../../i18n'
import type { useImageUpload } from '../../composables/useImageUpload'
for (const locale of ['en', 'zh-HK', 'zh-CN'] as const) {
  for (const theme of ['light', 'dark']) {
    it(`${locale}/${theme}: progress, cancellation and retry are localized and accessible`, async () => {
      i18n.global.locale.value = locale; document.documentElement.dataset.theme = theme
      const cancel = vi.fn(), ensure = vi.fn().mockResolvedValue(['a'.repeat(24)])
      const upload = { uploading: true, error: '', progress: 55, cancel, ensure } as unknown as ReturnType<typeof useImageUpload>
      const wrapper = mount(ImageUploadStatus, { props: { upload } })
      expect(wrapper.get('progress').attributes('value')).toBe('55')
      expect(wrapper.get('progress').attributes('aria-label')).toBe(i18n.global.t('media.progress'))
      expect(wrapper.get('button').attributes('type')).toBe('button')
      await wrapper.get('button').trigger('click'); expect(cancel).toHaveBeenCalledOnce()
      await wrapper.setProps({ upload: { ...upload, uploading: false, error: i18n.global.t('media.uploadFailed') } })
      expect(wrapper.get('[role="alert"]').text()).toBe(i18n.global.t('media.uploadFailed'))
      expect(wrapper.get('button').text()).toBe(i18n.global.t('media.retry'))
      await wrapper.get('button').trigger('click'); expect(ensure).toHaveBeenCalledOnce()
      expect(wrapper.text()).not.toMatch(/media\./)
      wrapper.unmount()
    })
  }
}
