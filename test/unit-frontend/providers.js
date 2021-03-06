'use strict';

/* global chai: false, sinon: false */

var expect = chai.expect;

describe('The Unified Inbox Angular module providers', function() {

  var $rootScope, inboxProviders, inboxHostedMailMessagesProvider, inboxHostedMailAttachmentProvider, inboxHostedMailThreadsProvider, inboxSearchResultsProvider,
      $httpBackend, jmapClient, inboxMailboxesService, jmap, ELEMENTS_PER_REQUEST;

  function elements(id, length, offset) {
    var array = [], start = offset || 0;

    for (var i = start; i < (start + length); i++) {
      array.push({
        id: id + '_' + i,
        date: new Date(2016, 1, 1, 1, 1, 1, i), // The variable millisecond is what allows us to check ordering in the tests
        mailboxIds: ['id_inbox'],
        threadId: 'thread_' + i,
        hasAttachment: true
      });
    }

    return array;
  }

  beforeEach(function() {
    angular.mock.module('esn.core');
    angular.mock.module('esn.configuration');
    angular.mock.module('linagora.esn.unifiedinbox', function($provide) {
      jmapClient = {
        getMailboxes: function() {
          return $q.when([
            new jmap.Mailbox({}, 'id_inbox', 'name_inbox', { role: 'inbox' }),
            new jmap.Mailbox({}, 'id_trash', 'name_trash', { role: 'trash' }),
            new jmap.Mailbox({}, 'id_spam', 'name_spam', { role: 'spam' })
          ]);
        },
        getMessageList: function(options) {
          expect(options.filter.inMailboxes).to.deep.equal(['id_inbox']);

          return $q.when({
            messageIds: [1],
            getMessages: function() {
              return $q.when(elements('message', options.limit, options.position));
            },
            getThreads: function() {
              return $q.when(elements('thread', options.limit, options.position));
            }
          });
        }
      };

      $provide.value('withJmapClient', function(cb) {
        return cb(jmapClient);
      });
      $provide.decorator('inboxMailboxesService', function($delegate) {
        $delegate.flagIsUnreadChanged = sinon.spy($delegate.flagIsUnreadChanged);

        return $delegate;
      });
    });
  });

  beforeEach(angular.mock.inject(function(_$rootScope_, _inboxProviders_, _inboxHostedMailMessagesProvider_, _inboxSearchResultsProvider_,
                                          _inboxHostedMailAttachmentProvider_, _inboxHostedMailThreadsProvider_, _$httpBackend_, _inboxMailboxesService_, _jmap_,
                                          _ELEMENTS_PER_REQUEST_) {
    $rootScope = _$rootScope_;
    inboxProviders = _inboxProviders_;
    inboxHostedMailMessagesProvider = _inboxHostedMailMessagesProvider_;
    inboxSearchResultsProvider = _inboxSearchResultsProvider_;
    inboxHostedMailAttachmentProvider = _inboxHostedMailAttachmentProvider_;
    inboxHostedMailThreadsProvider = _inboxHostedMailThreadsProvider_;
    $httpBackend = _$httpBackend_;
    inboxMailboxesService = _inboxMailboxesService_;
    jmap = _jmap_;

    ELEMENTS_PER_REQUEST = _ELEMENTS_PER_REQUEST_;
  }));

  describe('The inboxHostedMailMessagesProvider factory', function() {

    it('should request the backend using the JMAP client, and return pages of messages', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailMessagesProvider.fetch(filter);

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_REQUEST);
        expect(messages[ELEMENTS_PER_REQUEST - 1]).to.shallowDeepEqual({
          id: 'message_0'
        });
      });
      $rootScope.$digest();

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_REQUEST);
        expect(messages[ELEMENTS_PER_REQUEST - 1]).to.shallowDeepEqual({
          id: 'message_200'
        });

        done();
      });
      $rootScope.$digest();
    });

    it('should support fetching recent items', function(done) {
      var fetcher = inboxHostedMailMessagesProvider.fetch({ inMailboxes: ['id_inbox'] });

      jmapClient = {
        getMailboxWithRole: function(role) {
          return $q.when({ id: 'id_' + role.value });
        },
        getMessageList: function(options) {
          expect(options.filter).to.deep.equal({
            inMailboxes: ['id_inbox'],
            after: new Date(2016, 1, 1, 1, 1, 1, 199)
          });
          expect(options.position).to.equal(0);

          done();
        }
      };

      fetcher.loadRecentItems({
        date: new Date(2016, 1, 1, 1, 1, 1, 199)
      });
      $rootScope.$digest();
    });

    it('should update mailbox badge when fetching unread recent items', function() {
      var fetcher = inboxHostedMailMessagesProvider.fetch({ inMailboxes: ['id_inbox'] });

      jmapClient.getMessageList = function() {
        return $q.when({
          messageIds: ['id1', 'id2'],
          getMessages: function() {
            return $q.when([
              {
                id: 'id1',
                date: new Date(2016, 1, 1, 1, 1, 1, 0),
                mailboxIds: ['id_inbox'],
                isUnread: true
              },
              {
                id: 'id2',
                date: new Date(2016, 1, 1, 1, 1, 1, 0),
                mailboxIds: ['id_inbox', 'id_otherMailbox'],
                isUnread: true
              },
              {
                id: 'id3',
                date: new Date(2016, 1, 1, 1, 1, 1, 0),
                mailboxIds: ['id_inbox']
              }
            ]);
          }
        });
      };

      fetcher.loadRecentItems({});
      $rootScope.$digest();

      expect(inboxMailboxesService.flagIsUnreadChanged).to.have.been.calledWith(sinon.match({ id: 'id1' }));
      expect(inboxMailboxesService.flagIsUnreadChanged).to.have.been.calledWith(sinon.match({ id: 'id2' }));
      expect(inboxMailboxesService.flagIsUnreadChanged).to.have.not.been.calledWith(sinon.match({ id: 'id3' }));
    });

    it('should do not update mailbox badge when fetching unread old items', function() {
      var fetcher = inboxHostedMailMessagesProvider.fetch({ inMailboxes: ['id_inbox'] });
      var email = {
        id: 'id1',
        date: new Date(2014, 1, 1, 1, 1, 1, 0),
        mailboxIds: ['id_inbox'],
        isUnread: true
      };

      jmapClient.getMessageList = function() {
        return $q.when({
          messageIds: ['id1'],
          getMessages: function() {
            return $q.when([email]);
          }
        });
      };

      fetcher.loadRecentItems(email).then(function(mostRecentItem) {
        expect(mostRecentItem).to.deep.equal([]);
      });

      $rootScope.$digest();

      expect(inboxMailboxesService.flagIsUnreadChanged).to.have.not.been.called;
    });

    describe('The itemMatches function', function() {

      function newMessage(mailboxId, options) {
        return new jmap.Message(null, 'id', 'threadId', [mailboxId || 'id_inbox'], options);
      }

      function jmapFilter(context, filter) {
        return {
          context: context,
          filterByType: {
            jmap: filter || {}
          }
        };
      }

      it('should resolve when item matches default context and neither context nor filter is selected', function(done) {
        inboxHostedMailMessagesProvider.itemMatches(newMessage(), jmapFilter()).then(done);
        $rootScope.$digest();
      });

      it('should resolve when item matches context and no filter is selected', function(done) {
        inboxHostedMailMessagesProvider.itemMatches(newMessage('other_mailbox'), jmapFilter('other_mailbox')).then(done);
        $rootScope.$digest();
      });

      it('should resolve when item matches negative context and no filter is selected', function(done) {
        inboxHostedMailMessagesProvider.itemMatches(newMessage('other_mailbox'), jmapFilter('all')).then(done);
        $rootScope.$digest();
      });

      it('should resolve when item matches context and filter', function(done) {
        inboxHostedMailMessagesProvider.itemMatches(newMessage('other_mailbox', { isUnread: true }), jmapFilter('other_mailbox', { isUnread: true })).then(done);
        $rootScope.$digest();
      });

      it('should reject when item does not match default context', function(done) {
        inboxHostedMailMessagesProvider.itemMatches(newMessage('other_mailbox'), jmapFilter()).catch(done);
        $rootScope.$digest();
      });

      it('should reject when item does not match context', function(done) {
        inboxHostedMailMessagesProvider.itemMatches(newMessage('other_mailbox'), jmapFilter('id_trash')).catch(done);
        $rootScope.$digest();
      });

      it('should reject when item does not match negative context', function(done) {
        inboxHostedMailMessagesProvider.itemMatches(newMessage('id_spam'), jmapFilter('all')).catch(done);
        $rootScope.$digest();
      });

      it('should reject when item does not match filter', function(done) {
        inboxHostedMailMessagesProvider.itemMatches(newMessage('id_inbox'), jmapFilter('', { isFlagged: true })).catch(done);
        $rootScope.$digest();
      });

    });

  });

   describe('The inboxSearchResultsProvider factory', function() {

    it('should request the backend using the JMAP client, and return pages of messages', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxSearchResultsProvider.fetch(filter);

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_REQUEST);
        expect(messages[ELEMENTS_PER_REQUEST - 1]).to.shallowDeepEqual({
          id: 'message_0'
        });
      });
      $rootScope.$digest();

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_REQUEST);
        expect(messages[ELEMENTS_PER_REQUEST - 1]).to.shallowDeepEqual({
          id: 'message_200'
        });

        done();
      });
      $rootScope.$digest();
    });

  });

  describe('The inboxHostedMailAttachmentProvider factory', function() {

    it('should request the backend using the JMAP client, and return pages of messages', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailAttachmentProvider.fetch(filter);

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_REQUEST);
        expect(messages[ELEMENTS_PER_REQUEST - 1]).to.shallowDeepEqual({
          id: 'message_199'
        });
      });
      $rootScope.$digest();

      fetcher().then(function(messages) {
        expect(messages.length).to.equal(ELEMENTS_PER_REQUEST);
        expect(messages[ELEMENTS_PER_REQUEST - 1]).to.shallowDeepEqual({
          id: 'message_399'
        });

        done();
      });
      $rootScope.$digest();
    });

  });

  describe('The inboxHostedMailThreadsProvider factory', function() {

    it('should have fetch function to resolve an array of thread', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailThreadsProvider.fetch(filter);

      fetcher().then(function(threads) {
        expect(threads).to.be.an.instanceof(Array);
        expect(threads[0].emails).to.be.an.instanceof(Array);
        done();
      });

      $rootScope.$digest();
    });

    it('should request the backend using the JMAP client, and return pages of threads', function(done) {
      var filter = { inMailboxes: ['id_inbox'] };
      var fetcher = inboxHostedMailThreadsProvider.fetch(filter);

      fetcher().then(function(threads) {
        expect(threads.length).to.equal(ELEMENTS_PER_REQUEST);
        expect(threads[ELEMENTS_PER_REQUEST - 1]).to.shallowDeepEqual({
          id: 'thread_199'
        });
      });
      $rootScope.$digest();

      fetcher().then(function(threads) {
        expect(threads.length).to.equal(ELEMENTS_PER_REQUEST);
        expect(threads[ELEMENTS_PER_REQUEST - 1]).to.shallowDeepEqual({
          id: 'thread_399'
        });

        done();
      });
      $rootScope.$digest();
    });

  });

  describe('The inboxProviders factory', function() {

    describe('The getAll function', function() {

      it('should return an array of providers, with the "loadNextItems" property initialized', function(done) {
        var provider1 = {
              buildFetchContext: sinon.spy(function() { return $q.when('container'); }),
              fetch: sinon.spy(function(container) {
                expect(container).to.equal('container');

                return function() {
                  return $q.when(elements('id', 2));
                };
              }),
              templateUrl: 'templateUrl'
            },
          provider2 = {
            buildFetchContext: sinon.spy(function() { return $q.when('container_2'); }),
            fetch: sinon.spy(function(container) {
              expect(container).to.equal('container_2');

              return function() {
                return $q.when(elements('id', ELEMENTS_PER_REQUEST));
              };
            }),
            templateUrl: 'templateUrl'
          };

        inboxProviders.add(provider1);
        inboxProviders.add(provider2);

        function enrichWithProvider(provider) {
          return function(item) {
            item.provider = provider;
            item.templateUrl = provider.templateUrl;

            return item;
          };
        }

        inboxProviders.getAll().then(function(providers) {
          $q.all(providers.map(function(provider) {
            return provider.loadNextItems();
          })).then(function(results) {
            expect(results[0]).to.deep.equal({ data: elements('id', 2).map(enrichWithProvider(provider1)), lastPage: true });
            expect(results[1]).to.deep.equal({ data: elements('id', ELEMENTS_PER_REQUEST).map(enrichWithProvider(provider2)), lastPage: false });

            done();
          });
        });
        $rootScope.$digest();
      });

    });

  });

  describe('The inboxJmapProviderContextBuilder', function() {

    var inboxJmapProviderContextBuilder;

    beforeEach(inject(function(_inboxJmapProviderContextBuilder_) {
      inboxJmapProviderContextBuilder = _inboxJmapProviderContextBuilder_;
    }));

    it('should build default context as a filter to get message list in Inbox folder', function() {
      inboxJmapProviderContextBuilder({ filterByType: {} }).then(function(context) {
        expect(context).to.deep.equal({
          inMailboxes: ['id_inbox'],
          text: undefined
        });
      });

      $rootScope.$digest();
    });

    it('should extend the JMAP filter when it is given', function() {
      inboxJmapProviderContextBuilder({
        filterByType: {
          jmap: { isUnread: true }
        }
      }).then(function(context) {
        expect(context).to.deep.equal({
          inMailboxes: ['id_inbox'],
          isUnread: true,
          text: undefined
        });
      });

      $rootScope.$digest();
    });

    it('should use quickFilter to filter on the backend side, when defined', function() {
      inboxJmapProviderContextBuilder({
        filterByType: {
          jmap: { isUnread: true }
        },
        quickFilter: 'filter'
      }).then(function(context) {
        expect(context).to.deep.equal({
          inMailboxes: ['id_inbox'],
          isUnread: true,
          text: 'filter'
        });
      });

      $rootScope.$digest();
    });

    it('should build search context when query is passed as an option', function() {
      inboxJmapProviderContextBuilder({ query: 'query' }).then(function(context) {
        expect(context).to.deep.equal({
          text: 'query'
        });
      });

      $rootScope.$digest();
    });

  });

});
