'use strict';

export default {
  /**
   * install plugin
   * @param Vue
   * @param options
   */
  install: function install (Vue, options = {}) {
    let asyncEventsProp = isCorrectCustomName('asyncEvents', options) || '$asyncEvents';
    let onEventProp = isCorrectCustomName('onEvent', options) || '$onEvent';
    let onceEventProp = isCorrectCustomName('onceEvent', options) || '$onceEvent';
    let emitEventProp = isCorrectCustomName('emitEvent', options) || '$emitEvent';
    let eraseEventProp = isCorrectCustomName('eraseEvent', options) || '$eraseEvent';
    let fallSilentProp = isCorrectCustomName('fallSilent', options) || '$fallSilent';

    /**
     * mix into vue
     */
    Vue.mixin({
      data () {return {
        shouldFallSilent: true,
      }},
      beforeCreate:  function beforeCreate () {
        this._uniqID = Math.random().toString(36).substr(2, 9);
      },

      beforeDestroy: function beforeDestroy () {
        if (this.shouldFallSilent) this.$fallSilent();
      }
    });

    /**
     * plugin local state
     * @type {{_events: {}}}
     */
    Vue.prototype[asyncEventsProp] = { _events: {} };
    let events = Vue.prototype[asyncEventsProp]._events;

    /**
     * add event listener
     * @param eventName
     * @param callback
     * @param options
     */
    Vue.prototype[onEventProp] = function (eventName, callback, options = { stop: false, expire: 0, once: false }) {
      const args = {
        events,
        subscriberId:   this._uniqID,
        listenerOrigin: this,
        options
      };

      if (isArray(eventName) && isArray(callback)) {
        for (let eventNameIndex = 0, len = eventName.length; eventNameIndex < len; eventNameIndex++) {
          for (let callbackIndex = 0, _len = callback.length; callbackIndex < _len; callbackIndex++) {
            addListener({
              ...args,
              eventName: eventName[eventNameIndex],
              callback:  callback[callbackIndex]
            });
          }
        }

        return;
      }

      if (isArray(eventName)) {
        for (let _eventNameIndex = 0, _len2 = eventName.length; _eventNameIndex < _len2; _eventNameIndex++) {
          addListener({
            ...args,
            eventName: eventName[_eventNameIndex],
            callback
          });
        }

        return;
      }

      if (isArray(callback)) {
        for (let _callbackIndex = 0, _len3 = callback.length; _callbackIndex < _len3; _callbackIndex++) {
          addListener({
            ...args,
            eventName,
            callback: callback[_callbackIndex]
          });
        }
      } else {
        addListener({
          ...args,
          eventName,
          callback
        });
      }
    };


    /**
     * add event listener that only listens for event once and removed once executed
     * @param eventName
     * @param callback
     * @param options
     */
    Vue.prototype[onceEventProp] = function (eventName, callback, options = { stop: false, expire: 0 }) {
      options.once = true;
      Vue.prototype[onEventProp](eventName, callback, options);
    };

    /**
     * emit event and run callbacks subscribed to the event
     * @param eventName
     * @param payload
     * @param options
     * @return {Promise<*>}
     */
    Vue.prototype[emitEventProp] = function (eventName, payload, options = {
      reverse: false,
      stop:    false,
      linger:  0,
      isAsync: false
    }) {
      return runCallbacks({ events, eventName, payload, eventOrigin: this, options });
    };

    /**
     * remove event from events object
     * @param eventName
     */
    Vue.prototype[eraseEventProp] = function (eventName) {
      if (!isEmpty(events)) {
        if (isArray(eventName)) {
          for (let eventIndex = 0, len = eventName.length; eventIndex < len; eventIndex++) {
            removeGlobalEvent({ events, eventName: eventName[eventIndex] });
          }
        } else {
          removeGlobalEvent({ events, eventName });
        }
      }
    };

    /**
     * unsubscribe from subscriptions
     * @param event
     * @param callback
     */
    Vue.prototype[fallSilentProp] = function (event, callback) {
      const subscriberId = this._uniqID;

      if (!isEmpty(events)) {
        if (event && event in events && typeof event === 'string' && !callback) {
          removeListeners({ events, event, subscriberId });

          return;
        }

        if (event && isArray(event) && !callback) {
          for (let eventIndex = 0, len = event.length; eventIndex < len; eventIndex++) {
            removeListeners({ events, event: event[eventIndex], subscriberId });
          }

          return;
        }

        if (event && callback && isArray(callback) && event in events && events[event].length) {
          for (let callbackIndex = 0, _len4 = callback.length; callbackIndex < _len4; callbackIndex++) {
            removeCallbacks({ events, event, subscriberId, callback: callback[callbackIndex] });
          }

          return;
        }

        if (event && callback && event in events && events[event].length) {
          removeCallbacks({ events, event, subscriberId, callback });

          return;
        }

        if (event && callback && typeof callback !== 'function') {
          return;
        }

        for (let _event in events) {
          removeListeners({ events, event: _event, subscriberId });
        }
      }
    };
  }
};



/**
 * assert if object is empty
 * @param obj
 * @return {boolean}
 */
function isEmpty (obj) {
  return Object.keys(obj).length === 0;
}

/**
 * assert if object is array
 * @param obj
 * @return {boolean}
 */
function isArray (obj) {
  return Array.isArray(obj);
}


const vueReservedProps = ['$options', '$parent', '$root', '$children', '$refs', '$vnode', '$slots', '$scopedSlots', '$createElement', '$attrs', '$listeners', '$el'];

/**
 * assert if prop type is not reserved
 * @param prop
 * @param options
 * @return {boolean|*}
 */
function isCorrectCustomName (prop, options) {
  if (vueReservedProps.includes(options[prop])) {
    console.warn('[vue-hooked-async-events]: ' + options[prop] + ' is used by Vue. Use another name');

    return false;
  }

  return options && typeof options[prop] === 'string' && options[prop];
}


/**
 * Add event listener
 * @param events
 * @param eventName
 * @param subscriberId
 * @param callback
 * @param options
 * @param listenerOrigin
 */
function addListener ({ events, eventName, subscriberId, callback, options, listenerOrigin }) {
  // todo check if listener has an event lingering for it, if so then trigger this listener's event
  (events[eventName] || (events[eventName] = [])).push({
    eventName,
    subscriberId,
    listenerOrigin,
    callback,
    options
  });

  if (options.expire) setTimeout(removeListeners, options.expire, ...arguments);
}

/**
 * Run event callbacks
 * @param events
 * @param eventName
 * @param payload
 * @param eventOptions
 * @param eventOrigin
 * @return {Promise<*>}
 */
async function runCallbacks ({ events, eventName, payload, eventOptions, eventOrigin }) {
  let event = events && events[eventName];
  let listenersTally = event && event.length;
  let meta = {
    eventName,
    // make sure we don't mutate the actual options
    eventOptions: Object.assign({}, eventOptions),
    callbackOptions: {},
    eventOrigin,
    listenersTally
  };
  let res = payload;

  if (listenersTally) {
    let _listeners;
    if (eventOptions.reverse) _listeners = events[eventName].reverse(); else _listeners = events[eventName];

    if (eventOptions.stop) listenersTally = 1;
    // console.debug(`[vue-hooked-async-events] index-66: runCallbacks() - eventName: %o, \neventOrigin: %o, \n_listeners: %o`, eventName, eventOrigin, _listeners.map(li => li.listenerOrigin._uid));
    for (let listenerIndex = 0; listenerIndex < listenersTally; listenerIndex++) {
      let listener = _listeners[listenerIndex];

      // console.debug(`[vue-hooked-async-events] index-70: runCallbacks() - listener: %o`, listener.listenerOrigin._uid);

      // make sure we don't mutate the actual options
      meta.callbackOptions = Object.assign({}, listener.options);

      if (eventOptions.isAsync) {
        res = await listener.callback(res, meta);
      } else {
        listener.callback(payload, meta);
      }

      if (listener.options.stop || eventOptions.stop) break;
      // todo cater for linger and expire changes from listener
    }
  }

  return res;
}

/**
 * remove all event listeners
 * @param events
 * @param event
 * @param subscriberId
 */
function removeListeners ({ events, event, subscriberId }) {
  for (let listenerIndex = 0; listenerIndex < events[event].length; listenerIndex++) {
    if (events[event][listenerIndex].subscriberId === subscriberId) {
      events[event].splice(listenerIndex, 1);
    }
  }
}


/**
 * remove event callbacks
 * @param events
 * @param event
 * @param subscriberId
 * @param callback
 */
function removeCallbacks ({ events, event, subscriberId, callback }) {
  let indexOfSubscriber = events[event].findIndex(function (el) {
    return el.subscriberId === subscriberId && el.callback === callback;
  });

  if (~indexOfSubscriber) {
    events[event].splice(indexOfSubscriber, 1);
  }
}


/**
 * remove event and all its callbacks
 * @param events
 * @param eventName
 */
function removeGlobalEvent ({ events, eventName }) {
  for (let event in events) {
    if (event === eventName) {
      delete events[eventName];
    }
  }
}
