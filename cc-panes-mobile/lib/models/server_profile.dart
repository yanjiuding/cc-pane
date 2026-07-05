/// 一个可连接的桌面端配置。密码需保存以支持 cookie 过期后的静默重登，
/// 整个 profile 列表存 flutter_secure_storage（Keystore/Keychain 加密）。
class ServerProfile {
  const ServerProfile({
    required this.id,
    required this.name,
    required this.baseUrl,
    required this.username,
    required this.password,
  });

  final String id;
  final String name;

  /// 形如 `http://192.168.1.5:18080` 或 `https://host.tailnet.ts.net`，无尾斜杠。
  final String baseUrl;
  final String username;
  final String password;

  factory ServerProfile.fromJson(Map<String, dynamic> json) => ServerProfile(
        id: json['id'] as String,
        name: json['name'] as String,
        baseUrl: json['baseUrl'] as String,
        username: json['username'] as String,
        password: json['password'] as String,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'baseUrl': baseUrl,
        'username': username,
        'password': password,
      };

  ServerProfile copyWith({String? name, String? baseUrl, String? username, String? password}) =>
      ServerProfile(
        id: id,
        name: name ?? this.name,
        baseUrl: baseUrl ?? this.baseUrl,
        username: username ?? this.username,
        password: password ?? this.password,
      );

  /// 规范化用户输入：补 scheme、去尾斜杠。
  static String normalizeBaseUrl(String input) {
    var url = input.trim();
    if (url.isEmpty) return url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://$url';
    }
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    return url;
  }
}
