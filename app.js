(function() {
  return {

    TICKET_STATUSES: ['new', 'open', 'solved', 'pending', 'hold', 'closed'],

    events: {
      // App
      'app.created': 'init',
      'ticket.requester.email.changed': 'onRequesterEmailChanged',

      // Requests
      'getUser.done': 'onGetUserDone',
      'getLocales.done': 'onGetLocalesDone',
      'getUserFields.done': 'onGetUserFieldsDone',
      'getOrganizationFields.done': 'onGetOrganizationFieldsDone',
      'getTickets.done': 'onGetTicketsDone',
      'searchTickets.done': 'onSearchTicketsDone',
      'getOrganizationTickets.done': 'onGetOrganizationTicketsDone',
      'getTicketAudits.done': 'getTicketAuditsDone',
      'getCustomRoles.done': 'onGetCustomRolesDone',

      // UI
      'click .expand-bar': 'onClickExpandBar',
      'click .cog': 'onCogClick',
      'click .back': 'onBackClick',
      'click .save': 'onSaveClick',
      'change .org-fields-activate': 'onActivateOrgFieldsChange',
      'change,keyup,input,paste .notes-or-details': 'onNotesOrDetailsChanged',

      // Misc
      'requestsFinished': 'onRequestsFinished'
    },

    requests: {
      getLocales: {
        url: '/api/v2/locales.json'
      },

      getOrganizationFields: {
        url: '/api/v2/organization_fields.json'
      },

      getOrganizationTickets: function(orgId) {
        return {
          url: helpers.fmt('/api/v2/organizations/%@/tickets.json', orgId)
        };
      },

      getTicketAudits: function(id){
        return {
          url: helpers.fmt('/api/v2/tickets/%@/audits.json', id)
        };
      },

      getTickets: function(userId, page) {
        page = page || 1;
        return {
          url: helpers.fmt('/api/v2/users/%@/tickets/requested.json?page=%@', userId, page)
        };
      },

      searchTickets: function(userId, status) {
        return {
          url: helpers.fmt('/api/v2/search.json?query=type:ticket requester:%@ status:%@', userId, status)
        };
      },

      getUser: function(userId) {
        return {
          url: helpers.fmt('/api/v2/users/%@.json?include=identities,organizations', userId)
        };
      },

      getCustomRoles: {
        url: '/api/v2/custom_roles.json'
      },

      getUserFields: {
        url: '/api/v2/user_fields.json'
      },

      saveSelectedFields: function(keys, orgKeys) {
        var appId = this.installationId();
        var settings = {
          'selectedFields': JSON.stringify(_.toArray(keys)),
          'orgFieldsActivated': this.storage.orgFieldsActivated.toString(),
          'orgFields': JSON.stringify(_.toArray(orgKeys))
        };
        this.settings = _.extend(this.settings, settings);
        return {
          type: 'PUT',
          url: helpers.fmt('/api/v2/apps/installations/%@.json', appId),
          dataType: 'json',
          data: {
            'settings': settings,
            'enabled': true
          }
        };
      },

      updateNotesOrDetails: function(type, id, data) {
        return {
          url: helpers.fmt('/api/v2/%@/%@.json', type, id),
          type: 'PUT',
          dataType: 'json',
          data: data
        };
      }
    },

    // TOOLS ===================================================================

    // Implement the partial() method of underscorejs, because 1.3.3 doesn't
    // include it.
    partial: function(func) {
      var args = Array.prototype.slice.call(arguments, 1);
      return function() {
        return func.apply(this,
                          args.concat(Array.prototype.slice.call(arguments)));
      };
    },

    // Implement the object() method of underscorejs, because 1.3.3 doesn't
    // include it. Simplified for our use.
    toObject: function(list) {
      if (list == null) return {};
      var result = {};
      for (var i = 0, l = list.length; i < l; i++) {
        result[list[i][0]] = list[i][1];
      }
      return result;
    },

    countedAjax: function() {
      this.storage.requestsCount++;
      return this.ajax.apply(this, arguments).always((function() {
        _.defer((this.finishedAjax).bind(this));
      }).bind(this));
    },

    finishedAjax: function() {
      if (--this.storage.requestsCount === 0) {
        this.trigger('requestsFinished');
      }
    },

    fieldsForCurrent: function(target, fields, selected, values) {
      return _.compact(_.map(selected, (function(key) {
        var field = _.find(fields, function(field) {
          return field.key === key;
        });
        if (!field) {
          return null;
        }
        var result = {
          key: key,
          description: field.description,
          title: field.title,
          editable: field.editable
        };
        if (key.indexOf('##builtin') === 0) {
          var subkey = key.split('_')[1];
          result.name = subkey;
          result.value = target[subkey];
          result.simpleKey = ['builtin', subkey].join(' ');
          if (subkey === 'tags') {
            result.value = this.renderTemplate('tags', {tags: result.value});
            result.html = true;
          } else if (subkey === 'locale') {
            result.value = this.storage.locales[result.value];
          } else if (!result.editable) {
            result.value = _.escape(result.value).replace(/\n/g,'<br>');
            result.html = true;
          }
        }
        else {
          result.simpleKey = ['custom', key].join(' ');
          result.value = values[key];
          if (field.type === 'date') {
            result.value = (result.value ? this.toLocaleDate(result.value) : '');
          } else if(!result.editable && values[key]) {
            result.value = _.escape(values[key]).replace(/\n/g,'<br>');
            result.html = true;
          }
        }
        return result;
      }).bind(this)));
    },

    fieldsForCurrentOrg: function() {
      if (!this.storage.user || !this.storage.user.organization) {
        return {};
      }
      return this.fieldsForCurrent(this.storage.user.organization,
                                   this.storage.organizationFields,
                                   this.storage.selectedOrgKeys,
                                   this.storage.user.organization.organization_fields);
    },

    fieldsForCurrentUser: function() {
      if (!this.storage.user) {
        return {};
      }
      return this.fieldsForCurrent(this.storage.user,
                                   this.storage.fields,
                                   this.storage.selectedKeys,
                                   this.storage.user.user_fields);
    },

    toLocaleDate: function(date) {
      return moment(date).utc().format('l');      
    },

    showDisplay: function() {
      this.switchTo('display', {
        ticketId: this.ticket().id(),
        isAdmin: this.currentUser().role() === 'admin',
        user: this.storage.user,
        tickets: this.makeTicketsLinks(this.storage.ticketsCounters),
        fields: this.fieldsForCurrentUser(),
        orgFields: this.fieldsForCurrentOrg(),
        orgFieldsActivated: this.storage.user && this.storage.orgFieldsActivated && this.storage.user.organization,
        org: this.storage.user && this.storage.user.organization,
        orgTickets: this.makeTicketsLinks(this.storage.orgTicketsCounters)
      });
      if (this.storage.spokeData) {
        this.displaySpoke();
      }
      if (this.store('expanded')) {
        this.onClickExpandBar(true);
      }
    },

    makeTicketsLinks: function(counters) {
      var links = {};
      var link = '#/tickets/%@/requester/requested_tickets'.fmt(this.ticket().id());
      var tag = this.$('<div>').append(this.$('<a>').attr('href', link));
      _.each(counters, function(value, key) {
        if (value && value !== '-') {
          tag.find('a').html(value);
          links[key] = tag.html();
        }
        else {
          links[key] = value;
        }
      }.bind(this));
      return links;
    },

    setEditable: function() {
      var role = this.currentUser().role();
      this.orgEditable = { general: false, notes: true };
      this.userEditable = true;
      if (role == "admin") {
        this.orgEditable = { general: true, notes: true };
      } else if (role != "agent") {
        this.countedAjax('getCustomRoles');
      }
    },

    // EVENTS ==================================================================

    init: function() {
      var defaultStorage = {
        user: null,
        ticketsCounters: {},
        orgTicketsCounters: {},
        requestsCount: 0,
        fields: [],
        selectedKeys: [],
        orgFieldsActivated: false,
        tickets: []
      };
      this.storage = _.clone(defaultStorage); // not sure the clone is needed here
      this.storage.orgFieldsActivated = (this.setting('orgFieldsActivated') == 'true');
      var defaultSelection = '["##builtin_tags", "##builtin_details", "##builtin_notes"]';
      this.storage.selectedKeys = JSON.parse(this.setting('selectedFields') || defaultSelection);
      var defaultOrgSelection = '[]';
      this.storage.selectedOrgKeys = JSON.parse(this.setting('orgFields') || defaultOrgSelection);
      if (!this.locale) {
        this.locale = this.currentUser().locale();
      }
      this.setEditable();
      if (this.ticket().requester()) {
        this.requesterEmail = this.ticket().requester().email();
        this.countedAjax('getUser', this.ticket().requester().id());
        this.countedAjax('getUserFields');
        this.countedAjax('getOrganizationFields');
        if (!this.storage.locales) {
          this.countedAjax('getLocales');
        }
      } else {
        this.switchTo('empty');
      }
    },

    onRequesterEmailChanged: function(event, email) {
      if (email && this.requesterEmail != email) {
        this.init();
      }
    },

    onRequestsFinished: function() {
      if (!this.storage.user) return;
      var ticketsCounters = this.storage.ticketsCounters;
      _.each(['new', 'open', 'hold', 'pending', 'solved', 'closed'], function(key) {
        if (!ticketsCounters[key]) {
          ticketsCounters[key] = '-';
        }
      });
      ticketsCounters = this.storage.orgTicketsCounters;
      _.each(['new', 'open', 'hold', 'pending', 'solved', 'closed'], function(key) {
        if (!ticketsCounters[key]) {
          ticketsCounters[key] = '-';
        }
      });
      this.showDisplay();
    },

    onClickExpandBar: function(event, immediate) {
      var additional = this.$('.more-info');
      var expandBar = this.$('.expand-bar i');
      expandBar.attr('class', 'arrow');
      var visible = additional.is(':visible');
      if (immediate) {
        additional.toggle(!visible);
      }
      else {
        additional.slideToggle(!visible);
        this.store('expanded', !visible);
      }
      expandBar.addClass(visible ? 'arrow-down' : 'arrow-up');
    },

    onCogClick: function() {
      var html = this.renderTemplate('admin', {
        fields: this.storage.fields,
        orgFields: this.storage.organizationFields,
        orgFieldsActivated: this.storage.orgFieldsActivated
      });
      this.$('.admin').html(html).show();
      this.$('.whole').hide();
    },

    onBackClick: function() {
      this.$('.admin').hide();
      this.$('.whole').show();
    },

    onSaveClick: function() {
      var that = this;
      var keys = this.$('.fields-list input:checked').map(function() { return that.$(this).val(); });
      var orgKeys = this.$('.org-fields-list input:checked').map(function() { return that.$(this).val(); });
      this.$('input, button').prop('disabled', true);
      this.$('.save').hide();
      this.$('.wait-spin').show();
      this.ajax('saveSelectedFields', keys, orgKeys)
        .always(this.init.bind(this));
    },

    onNotesOrDetailsChanged: _.debounce(function(e) {
      var $textarea    = this.$(e.currentTarget),
          $textareas   = $textarea.parent().siblings('[data-editable=true]').andSelf().find('textarea'),
          type         = $textarea.data('fieldType'),
          typeSingular = type.slice(0, -1),
          data         = {},
          id           = type === 'organizations' ? this.storage.organization.id : this.ticket().requester().id();

      // Build the data object, with the valid resource name and data
      data[typeSingular] = {};
      $textareas.each(function(index, element) {
        var $element  = this.$(element),
            fieldName = $element.data('fieldName');

        data[typeSingular][fieldName] = $element.val();
      }.bind(this));

      // Execute request
      this.ajax('updateNotesOrDetails', type, id, data).then(function() {
        services.notify(this.I18n.t('update_' + typeSingular + '_done'));
      }.bind(this));
    }, 1000),

    onActivateOrgFieldsChange: function(event) {
      var activate = this.$(event.target).is(':checked');
      this.storage.orgFieldsActivated = activate;
      this.$('.org-fields-list').toggle(activate);
    },

    // REQUESTS ================================================================

    onGetCustomRolesDone: function(data) {
      var roles = data.custom_roles;
      var role = _.find(roles, function(role) {
        return role.id == this.currentUser().role();
      }, this);
      this.orgEditable.general = role.configuration.organization_editing;
      this.orgEditable.notes = role.configuration.organization_notes_editing;
      this.userEditable = role.configuration.end_user_profile_access == "full";
      _.each(this.storage.organizationFields, function(field) {
        if (field.key === '##builtin_tags') {
          return;
        } else if (field.key === '##builtin_notes') {
          field.editable = this.orgEditable.notes;
        } else {
          field.editable = this.orgEditable.general;
        }
      }, this);
    },

    onGetLocalesDone: function(data) {
      var locales = {};
      _.each(data.locales, function(obj) {
        locales[obj.locale] = obj.name;
      });
      this.storage.locales = locales;
    },

    onGetUserDone: function(data) {
      this.storage.user = data.user;
      var social = _.filter(data.identities, function(ident) {
        return _.contains(['twitter', 'facebook'], ident.type);
      });
      this.storage.user.identities = _.map(social, function(ident) {
        if (ident.type === 'twitter') {
          ident.value = helpers.fmt('https://twitter.com/%@', ident.value);
        } else if (ident.type === 'facebook') {
          ident.value = helpers.fmt('https://facebook.com/%@', ident.value);
        }
        return ident;
      });
      this.storage.user.organization = data.organizations[0];
      var ticketOrg = this.ticket().organization();
      if (ticketOrg) {
        this.storage.user.organization = _.find(data.organizations, function(org) {
          return org.id === ticketOrg.id();
        });
      }
      this.countedAjax('getOrganizationFields');
      if (data.user && data.user.id) {
        this.countedAjax('getTickets', this.storage.user.id);
      }
      if (data.user.organization) {
        this.storage.organization = {
          id: data.user.organization.id
        };
        this.countedAjax('getOrganizationTickets', this.storage.organization.id);
      }

      if (this.ticket().id()) {
        this.countedAjax('getTicketAudits', this.ticket().id());
      }
    },

    getTicketAuditsDone: function(data){
      _.each(data.audits, function(audit){
        _.each(audit.events, function(e){
          if (this.auditEventIsSpoke(e)){
            var spokeData = this.spokeData(e);

            if (spokeData){
              this.storage.spokeData = spokeData;
              this.storage.user.email = spokeData.email;
              this.displaySpoke();
            }
          }
        }, this);
      }, this);
    },

    displaySpoke: function() {
      var html = this.renderTemplate('spoke', this.storage.spokeData);
      this.$('.spoke').html(html);
    },

    auditEventIsSpoke: function(event){
      return event.type === 'Comment' &&
        /spoke_id_/.test(event.body);
    },

    spokeData: function(event){
      var data = /spoke_id_(.*) *\n *spoke_account_(.*) *\n *requester_email_(.*) *\n *requester_phone_(.*)/.exec(event.body);

      if (_.isEmpty(data))
        return false;

      return {
        id: data[1].trim(),
        account: data[2].trim(),
        email: data[3].trim(),
        phone: data[4].trim()
      };
    },

    onSearchTicketsDone: function(data) {
      var status = this.TICKET_STATUSES[this.ticketSearchStatus];
      this.storage.ticketsCounters = this.storage.ticketsCounters || {};
      this.storage.ticketsCounters[status] = data.count;
      if (this.ticketSearchStatus === this.TICKET_STATUSES.length - 1) {
        return;
      }
      this.countedAjax('searchTickets', this.storage.user.id, this.TICKET_STATUSES[++this.ticketSearchStatus]);
    },

    onGetTicketsDone: function(data) {
      this.storage.tickets.push.apply(this.storage.tickets, data.tickets);
      if (data.next_page) {
        // determine if it is fewer API hits to search or to continue loading all the tickets
        if (data.count / data.tickets.length - 1 > this.TICKET_STATUSES.length) {
          this.ticketSearchStatus = 0;
          this.countedAjax('searchTickets', this.storage.user.id, this.TICKET_STATUSES[this.ticketSearchStatus]);
          return;
        }
        var pageNumber = data.next_page.match(/page=(\d+)/)[1];
        this.countedAjax('getTickets', this.storage.user.id, pageNumber);
      }
      else {
        var grouped = _.groupBy(this.storage.tickets, 'status');
        var res = this.toObject(_.map(grouped, function(value, key) {
          return [key, value.length];
        }));
        this.storage.ticketsCounters = res;
      }
    },

    onGetOrganizationTicketsDone: function(data) {
      var grouped = _.groupBy(data.tickets, 'status');
      var res = this.toObject(_.map(grouped, function(value, key) {
        return [key, value.length];
      }));
      this.storage.orgTicketsCounters = res;
    },

    onGetOrganizationFieldsDone: function(data) {
      var selectedFields = this.storage.selectedOrgKeys;
      var fields = [
        {
          key: '##builtin_tags',
          title: this.I18n.t('tags'),
          description: '',
          position: 0,
          active: true
        },
        {
          key: '##builtin_details',
          title: this.I18n.t('details'),
          description: '',
          position: Number.MAX_SAFE_INTEGER - 1,
          active: true,
          editable: this.orgEditable.general
        },
        {
          key: '##builtin_notes',
          title: this.I18n.t('notes'),
          description: '',
          position: Number.MAX_SAFE_INTEGER,
          active: true,
          editable: this.orgEditable.notes
        }
      ].concat(data.organization_fields);
      var activeFields = _.filter(fields, function(field) {
        return field.active;
      });
      var restrictedFields = _.map(activeFields, function(field) {
        return {
          key: field.key,
          title: field.title,
          description: field.description,
          position: field.position,
          selected: _.contains(selectedFields, field.key),
          editable: field.editable,
          type: field.type
        };
      });
      this.storage.organizationFields = _.sortBy(restrictedFields, 'position');
    },

    onGetUserFieldsDone: function(data) {
      var selectedFields = this.storage.selectedKeys;
      var fields = [
        {
          key: '##builtin_tags',
          title: this.I18n.t('tags'),
          description: '',
          position: 0,
          active: true
        },
        {
          key: '##builtin_locale',
          title: this.I18n.t('locale'),
          description: '',
          position: 1,
          active: true
        },
        {
          key: '##builtin_details',
          title: this.I18n.t('details'),
          description: '',
          position: Number.MAX_SAFE_INTEGER - 1,
          active: true,
          editable: this.userEditable
        },
        {
          key: '##builtin_notes',
          title: this.I18n.t('notes'),
          description: '',
          position: Number.MAX_SAFE_INTEGER,
          active: true,
          editable: this.userEditable
        }
      ].concat(data.user_fields);
      var activeFields = _.filter(fields, function(field) {
        return field.active;
      });
      var restrictedFields = _.map(activeFields, function(field) {
        return {
          key: field.key,
          title: field.title,
          description: field.description,
          position: field.position,
          selected: _.contains(selectedFields, field.key),
          editable: field.editable,
          type: field.type
        };
      });
      this.storage.fields = _.sortBy(restrictedFields, 'position');
    }
  };
}());
