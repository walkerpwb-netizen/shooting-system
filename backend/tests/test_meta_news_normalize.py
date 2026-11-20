import unittest

from meta_news_normalize import display_text, is_news, normalize_post


class MetaNewsNormalizeTests(unittest.TestCase):
    def test_hashtag_must_be_a_separate_tag(self):
        for text in ("#news", "Nowość #NEWS!", "#news\nDalej"):
            self.assertTrue(is_news(text))
        for text in ("#newsletter", "x#news", "##news", "news"):
            self.assertFalse(is_news(text))
        self.assertEqual(display_text("Dobra wiadomość #NEWS!"), "Dobra wiadomość !")

    def test_instagram_carousel_and_video_thumbnail(self):
        post = {"id": "42", "caption": "Treść #news", "timestamp": "2026-11-20T12:00:00+0000",
                "permalink": "https://www.instagram.com/p/42/", "children": {"data": [
                    {"media_type": "IMAGE", "media_url": "https://example.com/a.jpg"},
                    {"media_type": "VIDEO", "media_url": "https://example.com/v.mp4", "thumbnail_url": "https://example.com/v.jpg"},
                ]}}
        result = normalize_post("instagram", post)
        self.assertEqual([item["type"] for item in result["media"]], ["image", "video"])
        self.assertEqual(result["media"][1]["url"], "https://example.com/v.jpg")

    def test_facebook_album_and_unmarked_post(self):
        post = {"id": "1_2", "message": "#news", "created_time": "2026-11-20T12:00:00+0000",
                "permalink_url": "https://www.facebook.com/1/posts/2", "attachments": {"data": [
                    {"subattachments": {"data": [{"media": {"image": {"src": "https://example.com/a.jpg"}}},
                                                  {"media": {"image": {"src": "https://example.com/b.jpg"}}}]}}]}}
        self.assertEqual(len(normalize_post("facebook", post)["media"]), 2)
        post["message"] = "Inna wiadomość"
        self.assertIsNone(normalize_post("facebook", post))

    def test_marked_post_with_missing_id_or_unsafe_link_fails(self):
        post = {"id": "1", "message": "#news", "created_time": "2026-11-20T12:00:00+0000", "permalink_url": "javascript:alert(1)"}
        with self.assertRaises(ValueError):
            normalize_post("facebook", post)


if __name__ == "__main__":
    unittest.main()
