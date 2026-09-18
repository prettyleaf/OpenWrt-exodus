include $(TOPDIR)/rules.mk

PKG_NAME:=mihomo-meta
PKG_VERSION:=1.19.31
PKG_RELEASE:=2

PKG_LICENSE:=GPL3.0+
PKG_MAINTAINER:=Joseph Mory <morytyann@gmail.com>

# official prebuilt binary from MetaCubeX releases, the variant follows the GOARCH/GOARM/GOMIPS choice of OpenWrt golang packages
ifeq ($(ARCH),aarch64)
  MIHOMO_ARCH:=arm64
else ifeq ($(ARCH),arm)
  MIHOMO_ARM_FPU:=$(word 2,$(subst +,$(space),$(call qstrip,$(CONFIG_CPU_TYPE))))
  ifeq ($(MIHOMO_ARM_FPU),)
    MIHOMO_ARCH:=armv5
  else ifneq ($(filter $(MIHOMO_ARM_FPU),vfp vfpv2),)
    MIHOMO_ARCH:=armv6
  else
    MIHOMO_ARCH:=armv7
  endif
else ifeq ($(ARCH),i386)
  MIHOMO_ARCH:=$(if $(CONFIG_TARGET_x86_geode)$(CONFIG_TARGET_x86_legacy),386-softfloat,386)
else ifeq ($(ARCH),x86_64)
  MIHOMO_ARCH:=amd64-v1
else ifeq ($(ARCH),mips)
  MIHOMO_ARCH:=mips-$(if $(CONFIG_HAS_FPU),hardfloat,softfloat)
else ifeq ($(ARCH),mipsel)
  MIHOMO_ARCH:=mipsle-$(if $(CONFIG_HAS_FPU),hardfloat,softfloat)
else ifeq ($(ARCH),mips64)
  MIHOMO_ARCH:=mips64
else ifeq ($(ARCH),mips64el)
  MIHOMO_ARCH:=mips64le
else ifeq ($(ARCH),riscv64)
  MIHOMO_ARCH:=riscv64
else ifeq ($(ARCH),loongarch64)
  MIHOMO_ARCH:=loong64-abi2
endif

# sha256 of release assets, updated by the dependabot workflow
MIHOMO_HASH_arm64:=9e0f11afbf38426b8bd88fdc594678f8161c57eccb4e1b77acb12b493904f1d4
MIHOMO_HASH_armv5:=ea5d3ff818ff332a7bbbcd0206de2ae87686df1fbfafd57c37eab029e9a81e4b
MIHOMO_HASH_armv6:=a89e15d8f425c809a60376821218f3ea97b2998c46ba87c80d1ede832d28fd88
MIHOMO_HASH_armv7:=a61115819d9ebd568788b0f1bddfa6c9c03458071abdbda80f79291cac0276e1
MIHOMO_HASH_386:=797f5267ed92fb0d70ae9fc3513cbbffd52e18932954cb4d0b6a08d5d7829a66
MIHOMO_HASH_386-softfloat:=bb8209c30e1815746c767a9ec7dabba7eef4193b96654dc3272b62304a2da7ba
MIHOMO_HASH_amd64-v1:=d4304c546c3cddcb6fafd4b4fddb0ba1a95ffa36606fda56d75db2e59ad24114
MIHOMO_HASH_mips-softfloat:=a5a9673343bdd48c7ea69bd6c75f67c084232c4c129fffadddc34d1686fa94e4
MIHOMO_HASH_mips-hardfloat:=2e1463ae340b7af8e943ac4d5d1279d34c9fd39f755398e293116b0380912c2e
MIHOMO_HASH_mipsle-softfloat:=9061daa6a6b8cbb0491387e5de59663441b637eff0e3d295cec6949478752192
MIHOMO_HASH_mipsle-hardfloat:=64c3c264c055c7fe4ffae7a0fe916c3a1e54f316d181b7c1123bf02d295ea120
MIHOMO_HASH_mips64:=9652ee5ca9a1a8457b11b1ced8c42a0b84cac75722a774844d2b430df711c6f6
MIHOMO_HASH_mips64le:=a97905d257c0feee9baedd1ff7b7fd853b9a27dd0367084bbd2ce6be73b4157b
MIHOMO_HASH_riscv64:=407a3a750c73befb5109706b79e54c668a1662a9cdd151d0684bd653fead0809
MIHOMO_HASH_loong64-abi2:=e2940fd6ccf0a611ab4c8ea9f93c1262c2a6e0d793921098733f3b6d6b500200

PKG_SOURCE:=mihomo-linux-$(MIHOMO_ARCH)-v$(PKG_VERSION).gz
PKG_SOURCE_URL:=https://github.com/MetaCubeX/mihomo/releases/download/v$(PKG_VERSION)/
PKG_HASH:=$(MIHOMO_HASH_$(MIHOMO_ARCH))

include $(INCLUDE_DIR)/package.mk

define Package/mihomo-meta
  SECTION:=net
  CATEGORY:=Network
  TITLE:=A rule based proxy in Go.
  URL:=https://wiki.metacubex.one
  DEPENDS:=@(aarch64||arm||i386||loongarch64||mips||mips64||mips64el||mipsel||riscv64||x86_64) +ca-bundle +ip-full +kmod-inet-diag +kmod-tun
  PROVIDES:=mihomo
  CONFLICTS:=mihomo-alpha
  ALTERNATIVES:=\
    300:/usr/bin/mihomo:/usr/libexec/mihomo
endef

define Package/mihomo-meta/description
  A rule based proxy in Go. Official prebuilt binary from MetaCubeX releases.
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	gzip -dc $(DL_DIR)/$(PKG_SOURCE) > $(PKG_BUILD_DIR)/mihomo
endef

define Build/Compile
endef

# the binary is already stripped by upstream, stripping a go binary again can break it
STRIP:=:
RSTRIP:=:

define Package/mihomo-meta/install
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/mihomo $(1)/usr/libexec/mihomo
endef

$(eval $(call BuildPackage,mihomo-meta))
