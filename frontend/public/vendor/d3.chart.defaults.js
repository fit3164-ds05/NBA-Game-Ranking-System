/**
 * Generates accessors for defaults in a d3.chart,
 * triggers events when they change, and provides
 * mechanism to bind handlers to those events
 *
 * Requires:
 * - d3.chart
 */
(function () {

  // underscore debounce method
  var debounce = function (func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  };

  // initialize defaults in chart prototype
  var initDefaults = function (chartProto, defaults) {
    // Generate setters for default options
    defaults = d3.map(defaults || {});
    defaults.forEach(function (option, value) {
      // set option value
      var optionName = '_' + option; 
      chartProto[optionName] = value;

      // setup helper method to set option
      chartProto[option] = function (_) {
        // return value of option if not setting
        if (!arguments.length) return this[optionName];

        // otherwise set value
        this[optionName] = _;

        // trigger change handler for event
        this.trigger('change:' + option, _);

        // return this to chain
        return this;   
      };
    });      

    // if we have defaults, make sure we override defaults
    if (defaults.size()) {
      // override initialize method to initialize any options
      var oldInit = chartProto.initialize;
      chartProto.initialize = function (options) {
        // set value for any options that are defaults
        for (var optionName in options) {
          if (defaults.get(optionName)) {
            this['_' + optionName] = options[optionName];
          }
        }
        
        // call old initialize method
        oldInit.apply(this, arguments);
      }
    }
  };

  // initializes any associated events with defaults
  var initEvents = function (chartProto, events) {
    events = d3.map(events || {});
    if (events.size() > 0) {
      // create shared handler pool (to deal with debounced methods)
      var values = events.values();
      var handlers = {};
      for (var i = 0, l = values.length; i < l; ++i) {
        var value = values[i];
        var fn = value;
        var debounce = false;
        if (value.match(/^debounce:/i)) {
          fn = value.substr(9);
          debounce = true;
        } 
        handlers[value] = {fn: chartProto[fn], debounce: debounce};
      }

      // override initialize method to bind events
      var oldInit = chartProto.initialize;
      chartProto.initialize = function () {
        // call old initialize method
        oldInit.apply(this, arguments);

        // bind handlers to this
        for (var handler in handlers) {
          var o = handlers[handler];
          var boundFn = o.fn.bind(this);
          o.boundFn = o.debounce ? debounce(boundFn) : boundFn;
        }

        // bind events
        var self = this;
        events.forEach(function (eventNames, handler) {
          var names = eventNames.split(/\s+/); 
          for (var i = 0, l = names.length; i < l; ++i) {
            self.on('change:' + names[i], handlers[handler].boundFn); 
          }
        });
      };
    }
  };

  // define exports
  d3.chart.initializeDefaults = function (chart, defaults, events) {
    chartProto = chart.prototype;
    initDefaults(chartProto, defaults);
    initEvents(chartProto, events);
  };

})();
