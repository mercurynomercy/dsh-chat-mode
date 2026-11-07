// Client half of the chat mode plugin.
window.__ModuleLoader__.load({
  id: '@jianhengpan/dsh-chat-mode',
  factory(require) {
    function apply(_ctx) {
      console.info('[chat-mode] loaded')
    }
    return { inject: ['slots'], apply }
  },
})
