#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2018, Joyent, Inc.
#

#
# Tools
#
NODE =		node
NPM =		npm
JSL =		jsl
JSSTYLE = 	jsstyle

#
# Configuration used by Makefile.defs and Makefile.targ to generate
# "check" and "docs" targets.
#
JSON_FILES =		package.json
JS_FILES :=		bin/pgloadgen lib/pgloadgen.js
JSL_FILES_NODE =	$(JS_FILES)
JSSTYLE_FILES =		$(JS_FILES)

JSL_CONF_NODE =		tools/jsl.node.conf

#
# Configuration for build stamp recipes.
# This originally came from Makefile.defs.
#
MAKE_STAMPS_DIR ?=	make_stamps
CLEAN_FILES +=		$(MAKE_STAMPS_DIR)
MAKE_STAMP_REMOVE =	mkdir -p $(@D); rm -f $(@)
MAKE_STAMP_CREATE =	mkdir -p $(@D); touch $(@)
TOP =			$(shell pwd)

#
# Makefile.node_modules.defs provides a common target for installing modules
# with NPM from a dependency specification in a "package.json" file.  By
# including this Makefile, we can depend on $(STAMP_NODE_MODULES) to drive "npm
# install" correctly.
#
include ./tools/mk/Makefile.node_modules.defs

#
# Repo-specific targets
#
.PHONY: all
all: $(STAMP_NODE_MODULES)

include ./tools/mk/Makefile.node_modules.targ
include ./tools/mk/Makefile.targ
